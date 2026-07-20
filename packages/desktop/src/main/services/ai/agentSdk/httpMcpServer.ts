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
 * SECURITY: bound to 127.0.0.1 only (never reachable off-box), and every
 * tool call still flows through runForModel's proposal/approval gates, so
 * even a stray local caller cannot change the project without the writer's
 * approval. A bearer token was tried and removed: the SDK's MCP http client
 * does not reliably echo `config.headers` on the protocol handshake, which
 * 401'd every call and left the tools looking "not connected".
 */
import http from 'http'
import log from 'electron-log'
import { randomUUID } from 'crypto'
import { convertJsonSchemaToZod } from 'zod-from-json-schema'
import type { AgentToolService } from '../AgentToolService'
import { MCP_SERVER_NAME, TOOL_OUTPUT_CHAR_CAP } from './toolBridge'

/** Per-call wall-clock ceiling the SDK applies to this server's tools. */
const HTTP_MCP_TOOL_TIMEOUT_MS = 60000
/** Startup self-check budget — the server is local, so this is generous. */
const SELF_CHECK_TIMEOUT_MS = 5000

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

/**
 * Drive one real MCP `initialize` against the freshly-started server and
 * require a sane answer. Throws a writer-legible error otherwise, so a dead
 * tool channel surfaces at connect instead of as the agent guessing that
 * "the tools aren't connected".
 */
const assertMcpServerAnswers = async(url: string): Promise<void> => {
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'wordbird-selfcheck', version: '1.0.0' }
        }
      }),
      signal: AbortSignal.timeout(SELF_CHECK_TIMEOUT_MS)
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(
      `WordBird's tool server did not start (${detail}). Biscuit cannot read or ` +
        'write your project without it — restart the app, and report this if it persists.'
    )
  }
  if (!response.ok) {
    throw new Error(
      `WordBird's tool server answered ${response.status} during startup. Biscuit ` +
        'cannot read or write your project without it — restart the app, and report ' +
        'this if it persists.'
    )
  }
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

  /**
   * One McpServer instance per MCP SESSION. A single shared transport
   * cannot be reused: it answers exactly one `initialize` and rejects the
   * next with 400 "Server already initialized". The SDK opens a FRESH MCP
   * client for every turn, so a shared transport gave the writer tools on
   * turn 1 and none afterwards — "the mcp__wordbird__* tools aren't
   * connected at all, for any agent type" (writer report, 2026-07-20).
   */
  const buildMcp = (): InstanceType<typeof McpServer> => {
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
    return mcp
  }

  // sessionId → live transport. An initialize (no session header) mints a
  // new one; every later request routes by its mcp-session-id.
  const sessions = new Map<string, InstanceType<typeof StreamableHTTPServerTransport>>()

  // SECURITY: bound to 127.0.0.1 ONLY (below), so no off-box access. Every
  // tool call still flows through runForModel's proposal/approval gates, so
  // even a stray local caller cannot write without the writer's OK.
  const server = http.createServer(async(req, res) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined
      const existing = sessionId ? sessions.get(sessionId) : undefined
      if (existing) {
        await existing.handleRequest(req, res)
        return
      }
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid: string) => {
          sessions.set(sid, transport)
        }
      })
      transport.onclose = (): void => {
        if (transport.sessionId) sessions.delete(transport.sessionId)
      }
      await buildMcp().connect(transport)
      await transport.handleRequest(req, res)
    } catch {
      if (!res.headersSent) res.writeHead(500).end()
    }
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  const url = `http://127.0.0.1:${port}/mcp`

  // SELF-CHECK: prove the server actually answers before handing the URL to
  // the runtime. A tool server that never came up is indistinguishable, from
  // the model's side, from a mystery outage — it reports "the wordbird tools
  // aren't connected" and the writer has nothing to act on. Failing loudly
  // here turns that into a real, attributable error at connect time.
  await assertMcpServerAnswers(url)
  log.info(`[wordbird-mcp] serving ${toolNames.length} tools at ${url}`)

  const close = async(): Promise<void> => {
    for (const transport of sessions.values()) {
      try {
        await transport.close?.()
      } catch {
        /* already closed */
      }
    }
    sessions.clear()
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
