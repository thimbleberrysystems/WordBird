/**
 * Durable writes for the project's own state.
 *
 * WordBird keeps far more than one document on disk: `structure.json` is the
 * binder's source of truth, and the fact/continuity/decision ledgers, the
 * entity index, and agent-written prose all live beside it. A torn write to
 * any of them is worse than a torn document — an unparseable structure.json
 * loses the whole binder, not one scene.
 *
 * These helpers write to a temp file, fsync it, then rename it over the
 * target (write-file-atomic), which is what makes a save survive a power
 * loss rather than only an application crash: a bare rename is atomic in the
 * directory namespace but says nothing about whether the DATA reached the
 * platter, so an interrupted write can leave a full-length, zero-filled file.
 *
 * Parent directories are created first because write-file-atomic does not
 * create them (it fails ENOENT), and several callers write into a directory
 * that may not exist yet.
 *
 * Deliberately NOT used for the web cache (`WebToolHandlers`): those entries
 * are regenerable and written on every fetch, so an fsync per entry is cost
 * without benefit.
 */

import fs from 'fs'
import path from 'path'
import writeFileAtomic from 'write-file-atomic'

/**
 * Durably write text/JSON (or a binary payload — compiled EPUB/DOCX takes the
 * same path), creating the parent directory if needed.
 */
export const writeFileDurable = async(file: string, data: string | Buffer): Promise<void> => {
  await fs.promises.mkdir(path.dirname(file), { recursive: true })
  await writeFileAtomic(file, data, 'utf8')
}

/** Synchronous counterpart, for the callers already committed to sync IO. */
export const writeFileDurableSync = (file: string, data: string | Buffer): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  writeFileAtomic.sync(file, data, 'utf8')
}
