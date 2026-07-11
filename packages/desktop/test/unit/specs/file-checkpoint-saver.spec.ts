import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { StateGraph, MessagesAnnotation } from '@langchain/langgraph'
import { HumanMessage, AIMessage } from '@langchain/core/messages'
import { FileCheckpointSaver } from '../../../src/main/services/ai/FileCheckpointSaver'

let dir: string
let file: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordbird-ckpt-'))
  file = path.join(dir, 'agent-state', 'checkpoints.json')
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

/** A trivial graph that appends one AI message per invocation. */
const buildGraph = (saver: FileCheckpointSaver) =>
  new StateGraph(MessagesAnnotation)
    .addNode('agent', async(state) => ({
      messages: [new AIMessage(`reply-${state.messages.length}`)]
    }))
    .addEdge('__start__', 'agent')
    .compile({ checkpointer: saver })

describe('FileCheckpointSaver', () => {
  it('persists thread state across saver instances (simulated restart)', async() => {
    const saver = new FileCheckpointSaver(file)
    const graph = buildGraph(saver)
    const config = { configurable: { thread_id: 'thread-1' } }

    await graph.invoke({ messages: [new HumanMessage('hello')] }, config)
    saver.flush()
    expect(fs.existsSync(file)).toBe(true)

    // "Restart": brand-new saver reading the same file.
    const revived = new FileCheckpointSaver(file)
    expect(await revived.hasThread('thread-1')).toBe(true)
    expect(await revived.hasThread('thread-2')).toBe(false)

    // The revived graph continues the same conversation state.
    const graph2 = buildGraph(revived)
    const result = (await graph2.invoke(
      { messages: [new HumanMessage('again')] },
      config
    )) as { messages: Array<{ content: unknown }> }
    // hello, reply-1, again, reply-3 — earlier turns were restored.
    expect(result.messages).toHaveLength(4)
    expect(String(result.messages[1].content)).toBe('reply-1')
  })

  it('keeps threads isolated', async() => {
    const saver = new FileCheckpointSaver(file)
    const graph = buildGraph(saver)

    await graph.invoke(
      { messages: [new HumanMessage('a')] },
      { configurable: { thread_id: 'a' } }
    )
    const result = (await graph.invoke(
      { messages: [new HumanMessage('b')] },
      { configurable: { thread_id: 'b' } }
    )) as { messages: unknown[] }
    expect(result.messages).toHaveLength(2)
  })

  it('starts fresh on a corrupt store file without throwing', () => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, 'not json at all', 'utf8')
    const saver = new FileCheckpointSaver(file)
    expect(saver).toBeDefined()
  })

  it('deleteThread persists the deletion', async() => {
    const saver = new FileCheckpointSaver(file)
    const graph = buildGraph(saver)
    const config = { configurable: { thread_id: 'doomed' } }
    await graph.invoke({ messages: [new HumanMessage('x')] }, config)
    await saver.deleteThread('doomed')
    saver.flush()

    const revived = new FileCheckpointSaver(file)
    expect(await revived.hasThread('doomed')).toBe(false)
  })
})
