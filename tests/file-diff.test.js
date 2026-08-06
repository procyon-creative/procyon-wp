import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const require = createRequire(import.meta.url)
const {
  MAX_TEXT_FILE_BYTES,
  displayContentDiffs,
  isBinary,
  renderFileDiff,
  safeJoin
} = require('../src/sync/file-diff')

const tempDirs = []

function tempDir () {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'procyon-file-diff-test-'))
  tempDirs.push(directory)
  return directory
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const directory of tempDirs.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('renderFileDiff', () => {
  it('uses a unified patch for text files', () => {
    const directory = tempDir()
    const oldPath = path.join(directory, 'old.txt')
    const newPath = path.join(directory, 'new.txt')
    fs.writeFileSync(oldPath, 'same\nold line\n')
    fs.writeFileSync(newPath, 'same\nnew line\n')

    const result = renderFileDiff(oldPath, newPath, { old: 'remote/file.txt', new: 'local/file.txt' })

    expect(result).toContain('--- remote/file.txt')
    expect(result).toContain('+++ local/file.txt')
    expect(result).toContain('-old line')
    expect(result).toContain('+new line')
  })

  it('does not print binary contents', () => {
    const directory = tempDir()
    const oldPath = path.join(directory, 'old.bin')
    const newPath = path.join(directory, 'new.bin')
    fs.writeFileSync(oldPath, Buffer.from([1, 0, 2]))
    fs.writeFileSync(newPath, Buffer.from([1, 0, 3]))

    expect(renderFileDiff(oldPath, newPath, { old: 'old', new: 'new' }))
      .toBe('Binary files differ; content diff is not displayed.')
  })

  it('skips large file contents', () => {
    const directory = tempDir()
    const oldPath = path.join(directory, 'old.txt')
    const newPath = path.join(directory, 'new.txt')
    fs.writeFileSync(oldPath, 'a'.repeat(MAX_TEXT_FILE_BYTES + 1))
    fs.writeFileSync(newPath, 'b')

    expect(renderFileDiff(oldPath, newPath, { old: 'old', new: 'new' }))
      .toContain('diff skipped')
  })
})

describe('displayContentDiffs', () => {
  it('compares remote to local for push and cleans up the remote copy', async () => {
    const localRoot = tempDir()
    fs.writeFileSync(path.join(localRoot, 'file.txt'), 'local\n')
    let fetchedPath
    const rsync = {
      buildLocal: () => localRoot,
      fetchRemoteFile: vi.fn(async (_remotePath, destination) => {
        fetchedPath = destination
        fs.writeFileSync(destination, 'remote\n')
      })
    }
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    await displayContentDiffs(rsync, 'wp-content/themes/example', {
      added: [],
      modified: ['file.txt'],
      deleted: []
    }, 'push')

    expect(rsync.fetchRemoteFile).toHaveBeenCalledWith('wp-content/themes/example/file.txt', expect.any(String))
    expect(log.mock.calls.flat().join('\n')).toContain('--- remote/file.txt')
    expect(log.mock.calls.flat().join('\n')).toContain('+++ local/file.txt')
    expect(fs.existsSync(fetchedPath)).toBe(false)
    expect(fs.readFileSync(path.join(localRoot, 'file.txt'), 'utf8')).toBe('local\n')
  })

  it('reverses patch direction for pull', async () => {
    const localRoot = tempDir()
    fs.writeFileSync(path.join(localRoot, 'file.txt'), 'local\n')
    const rsync = {
      buildLocal: () => localRoot,
      fetchRemoteFile: vi.fn(async (_remotePath, destination) => {
        fs.writeFileSync(destination, 'remote\n')
      })
    }
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    await displayContentDiffs(rsync, 'wp-content/themes/example', {
      added: [],
      modified: ['file.txt'],
      deleted: []
    }, 'pull')

    expect(log.mock.calls.flat().join('\n')).toContain('--- local/file.txt')
    expect(log.mock.calls.flat().join('\n')).toContain('+++ remote/file.txt')
  })
})

describe('path and binary safety', () => {
  it('rejects paths outside the comparison root', () => {
    expect(() => safeJoin('/tmp/root', '../secret')).toThrow('Unsafe diff path')
  })

  it('detects null bytes as binary content', () => {
    expect(isBinary(Buffer.from([65, 0, 66]))).toBe(true)
    expect(isBinary(Buffer.from('plain text'))).toBe(false)
  })
})
