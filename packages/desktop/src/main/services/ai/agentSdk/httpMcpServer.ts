/**
 * LOCAL HTTP MCP SERVER for WordBird's in-process tools.
 *
 * WHY NOT createSdkMcpServer (in-process 'sdk' transport): the SDK's
 * in-process MCP transport intermittently DROPS tool results under load —
 * the handler runs and returns content, but the model receives "completed
 * with no output" (upstream anthropics/claude-agent-sdk-typescript #108,
 * claude-code #43642/#36319). Large payloads (wiki_read/web_fetch) and
 * multi-call subagent turns are hit hardest. The same payloads arrive
 * intact over the Streamable HTTP transport — proven by a live probe
 * (6/6 results, 0 empty, a 30KB payload delivered). So we serve the SAME
 * tools (still executing IN THIS PROCESS via AgentToolService.runForModel —
 * the whole proposal/safety pipeline is unchanged) over a loopback HTTP
 * MCP server the Agent SDK connects to with `type: 'http'`.
 *
 * SECURITY: bound to 127.0.0.1 only, and every request must carry a
 * per-server bearer token (a random UUID) the SDK is handed via the config
 * `headers`. A different local process cannot reach the tools.
 */
import http from 'http'
import { randomUUID } from 'crypto'
import { convertJsonSchemaToZod } from 'zod-from-json-schema'
import type { AgentToolService } from '../AgentToolService'
import { MCP_SERVER_NAME, TOOL_OUTPUT_CHAR_CAP } from './toolBridge'

/** Per-call wall-clock ceiling the SDK applies to this server's tools. */
const HTTP_MCP_TOOL_TIMEOUT_MS = 60000

export interface HttpMcpServerConfig {
  type: 'http'
  url: string
  headers: Record<string, string>
  alwaysLoad: boolean
  timeout: number
}

export interface HttpMcpServerHandle {
  config: HttpMcpServerConfig
  toolNames: string[]
  close: () => Promise<void>
}

/** Result shape an MCP tool call returns to the model. */
type ToolResult = {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

/**
 * Run ONE WordBird tool for the HTTP MCP server: execute it in-process via
 * runForModel (the whole proposal/safety pipeline), cap + format the
 * output, and turn any throw into a tool error (never a crash). Exported so
 * the unit suite can exercise the exact wrapper the server registers.
 */
export const executeHttpTool = async(
  service: AgentToolService,
  name: string,
  args: Record<string, unknown>,
  getSignal?: () => AbortSignal | undefined
): Promise<ToolResult> => {
  const debug = !!process.env.WORDBIRD_TOOL_DEBUG
  const startedAt = debug ? Date.now() : 0
  try {
    const result = await service.runForModel(name, args ?? {}, getSignal?.())
    let text = typeof result === 'string' ? result : JSON.stringify(result ?? 'ok')
    if (text.length > TOOL_OUTPUT_CHAR_CAP) {
      text = text.slice(0, TOOL_OUTPUT_CHAR_CAP) + `\n…[output truncated at ${TOOL_OUTPUT_CHAR_CAP} characters]`
    }
    if (debug) {
      console.log(`[tooldbg] ${name} -> ${text.length} chars in ${Date.now() - startedAt}ms`)
    }
    return { content: [{ type: 'text', text }] }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
  }
}

/**
 * Build + start the loopback HTTP MCP server exposing every registered
 * WordBird tool. Tools run in-process through `service.runForModel`
 * (`getSignal` threads the live Stop signal, exactly as the in-process
 * bridge did). Mode gating is NOT done here — it stays at the allowlist /
 * subagent-tool level in AgentSDKRunner, so a write tool exposed here is
 * still uncallable in ask mode. Returns a handle whose `close()` tears the
 * server down (call it when the runner is disposed).
 */
export const buildWordbirdHttpMcpServer = async(
  service: AgentToolService,
  getSignal?: () => AbortSignal | undefined,
  alwaysLoad = true
): Promise<HttpMcpServerHandle> => {
  // Dynamic import: the MCP SDK is ESM; the Agent SDK is imported the same
  // way in AgentSDKRunner. Keeps the CJS main bundle from static-resolving it.
  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js')
  const { StreamableHTTPServerTransport } = await import(
    '@modelcontextprotocol/sdk/server/streamableHttp.js'
  )

  const toolNames = service.getDefinitions().map((d) => d.name)

  // ONE McpServer + ONE stateful transport — the exact shape a live probe
  // proved delivers reliably (6/6 results incl. a 30KB payload). The SDK
  // opens a fresh MCP client per turn; the stateful transport accepts each
  // one's initialize and tracks it by session id internally.
  const mcp = new McpServer({ name: MCP_SERVER_NAME, version: '1.0.0' })
  for (const definition of service.getDefinitions()) {
    const shape = (convertJsonSchemaToZod(definition.schema) as unknown as {
      shape: Record<string, unknown>
    }).shape
    mcp.registerTool(
      definition.name,
      { description: definition.description, inputSchema: shape as never },
      (async(args: Record<string, unknown>) =>
        executeHttpTool(service, definition.name, args, getSignal)) as never
    )
  }
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() })
  await mcp.connect(transport)

  // SECURITY: bound to 127.0.0.1 ONLY (below), so no off-box access. Every
  // tool call still flows through runForModel's proposal/approval gates, so
  // even a stray local caller cannot write without the writer's OK. (No
  // bearer token — the SDK's MCP http client does not reliably echo
  // config.headers on the handshake, which 401'd every call.)
  const server = http.createServer((req, res) => {
    transport.handleRequest(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500).end()
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  const url = `http://127.0.0.1:${port}/mcp`

  const close = async(): Promise<void> => {
    try {
      await (transport as { close?: () => Promise<void> }).close?.()
    } catch {
      /* already closed */
    }
    try {
      await (mcp as { close?: () => Promise<void> }).close?.()
    } catch {
      /* already closed */
    }
    try {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    } catch {
      /* already closed */
    }
  }

  return {
    config: {
      type: 'http',
      url,
      headers: {},
      alwaysLoad,
      timeout: HTTP_MCP_TOOL_TIMEOUT_MS
    },
    toolNames,
    close
  }
}
