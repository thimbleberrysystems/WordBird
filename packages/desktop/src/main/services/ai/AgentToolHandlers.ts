import crypto from 'crypto'
import fsPromises from 'fs/promises'
import path from 'path'
import type { AgentToolContext } from './AgentToolService'
import type { AgentToolService } from './AgentToolService'

const MAX_AGENT_FILE_BYTES = 2 * 1024 * 1024

interface ProjectFileResolution {
  projectRoot: string
  filePath: string
  relativePath: string
}

const getStringArg = (args: Record<string, unknown>, key: string): string => {
  const value = args[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Agent tool argument '${key}' must be a non-empty string.`)
  }
  return value.trim()
}

const getOptionalIntegerArg = (args: Record<string, unknown>, key: string): number | undefined => {
  const value = args[key]
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`Agent tool argument '${key}' must be a positive integer when provided.`)
  }
  return value
}

const getOptionalStringArg = (args: Record<string, unknown>, key: string): string | undefined => {
  const value = args[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    throw new Error(`Agent tool argument '${key}' must be a string when provided.`)
  }
  return value
}

const normalizeProjectRoot = (projectRoot?: string | null): string => {
  const normalized = projectRoot ? path.resolve(projectRoot) : ''
  return normalized
}

const isPathInsideDirectory = (directory: string, filePath: string): boolean => {
  const relative = path.relative(directory, filePath)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

const resolveProjectFile = (fname: string, context: AgentToolContext): ProjectFileResolution => {
  if (fname.includes('\0')) {
    throw new Error('Agent tool file path contains a NUL byte.')
  }

  const projectRoot = normalizeProjectRoot(context.projectRoot)
  if (!projectRoot) {
    throw new Error('No active WordBird project is open. Agent file tools require a project scope.')
  }

  const filePath = path.isAbsolute(fname) ? path.resolve(fname) : path.resolve(projectRoot, fname)
  if (!isPathInsideDirectory(projectRoot, filePath)) {
    throw new Error('Agent tool file path is outside the active WordBird project.')
  }

  return {
    projectRoot,
    filePath,
    relativePath: path.relative(projectRoot, filePath) || path.basename(filePath)
  }
}

const readTextFile = async(filePath: string): Promise<string> => {
  const stat = await fsPromises.stat(filePath)
  if (!stat.isFile()) {
    throw new Error(`Agent tool target is not a file: ${filePath}`)
  }
  if (stat.size > MAX_AGENT_FILE_BYTES) {
    throw new Error(`Agent tool file is too large. Maximum size is ${MAX_AGENT_FILE_BYTES} bytes.`)
  }

  const buffer = await fsPromises.readFile(filePath)
  if (buffer.includes(0)) {
    throw new Error('Agent tool cannot read binary files.')
  }

  return buffer.toString('utf8')
}

const normalizeLineRange = (
  content: string,
  start?: number,
  end?: number
): { start?: number; end?: number; startLine: number; endLine: number } => {
  const totalLines = content.length === 0 ? 0 : content.split('\n').length
  const startLine = start ?? 1
  const endLine = end ?? totalLines

  if (totalLines === 0) {
    if (start !== undefined || end !== undefined) {
      throw new Error('Line ranges cannot be applied to an empty file.')
    }
    return { start, end, startLine, endLine }
  }

  if (
    startLine < 1 ||
    endLine < 1 ||
    startLine > totalLines ||
    endLine > totalLines ||
    startLine > endLine
  ) {
    throw new Error('Agent tool line range is outside the file bounds.')
  }

  return { start, end, startLine, endLine }
}

const replaceLineRange = (
  oldContent: string,
  newContent: string,
  start?: number,
  end?: number
): string => {
  if (start === undefined && end === undefined) {
    return newContent
  }

  const lines = oldContent.split('\n')
  const startIdx = start === undefined ? 0 : start - 1
  const endIdx = end === undefined ? lines.length : end
  const replacementLines = newContent.split('\n')

  return [...lines.slice(0, startIdx), ...replacementLines, ...lines.slice(endIdx)].join('\n')
}

const readAgentFile = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const fname = getStringArg(args, 'fname')
  const start = getOptionalIntegerArg(args, 'start')
  const end = getOptionalIntegerArg(args, 'end')
  const { projectRoot, filePath, relativePath } = resolveProjectFile(fname, context)
  const content = await readTextFile(filePath)
  const range = normalizeLineRange(content, start, end)

  return {
    path: relativePath,
    projectRoot,
    filePath,
    content:
      content.length === 0
        ? ''
        : content.split('\n').slice(range.startLine - 1, range.endLine).join('\n'),
    start: range.start,
    end: range.end
  }
}

const proposeProjectFileEdit = async(
  args: Record<string, unknown>,
  context: AgentToolContext
): Promise<unknown> => {
  const fname = getStringArg(args, 'fname')
  const newdata = getStringArg(args, 'newdata')
  const start = getOptionalIntegerArg(args, 'start')
  const end = getOptionalIntegerArg(args, 'end')
  const reason = getOptionalStringArg(args, 'reason')
  const { filePath, relativePath } = resolveProjectFile(fname, context)
  const oldContent = await readTextFile(filePath)

  if (start !== undefined && end !== undefined && start > end) {
    throw new Error('Agent tool line range start must be less than or equal to end.')
  }

  const nextContent = replaceLineRange(oldContent, newdata, start, end)

  return {
    edit: {
      id: crypto.randomUUID(),
      filePath: relativePath,
      start,
      end,
      newContent: nextContent,
      reason
    },
    oldContent,
    originalPath: filePath
  }
}

export const registerBuiltInAgentToolHandlers = (service: AgentToolService): void => {
  service.registerHandler('read_project_file', readAgentFile)
  service.registerHandler('propose_project_file_edit', proposeProjectFileEdit)
}
