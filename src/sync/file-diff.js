const fs = require('fs')
const os = require('os')
const path = require('path')
const { createTwoFilesPatch } = require('diff')

const MAX_TEXT_FILE_BYTES = 1024 * 1024
const BINARY_SAMPLE_BYTES = 8192

function isBinary (buffer) {
  return buffer.subarray(0, BINARY_SAMPLE_BYTES).includes(0)
}

function readComparableFile (filePath) {
  const stats = fs.statSync(filePath)
  if (stats.size > MAX_TEXT_FILE_BYTES) {
    return { kind: 'large', size: stats.size }
  }

  const contents = fs.readFileSync(filePath)
  if (isBinary(contents)) return { kind: 'binary', size: stats.size }

  return { kind: 'text', contents: contents.toString('utf8') }
}

function renderFileDiff (oldPath, newPath, labels) {
  const oldFile = readComparableFile(oldPath)
  const newFile = readComparableFile(newPath)

  if (oldFile.kind === 'large' || newFile.kind === 'large') {
    return `Binary/content diff skipped (file exceeds ${MAX_TEXT_FILE_BYTES} bytes).`
  }
  if (oldFile.kind === 'binary' || newFile.kind === 'binary') {
    return 'Binary files differ; content diff is not displayed.'
  }

  return createTwoFilesPatch(
    labels.old,
    labels.new,
    oldFile.contents,
    newFile.contents,
    '',
    '',
    { context: 3 }
  ).trimEnd()
}

function safeJoin (root, relativePath) {
  const resolvedRoot = path.resolve(root)
  const resolvedPath = path.resolve(resolvedRoot, relativePath)
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Unsafe diff path: ${relativePath}`)
  }
  return resolvedPath
}

async function displayContentDiffs (rsync, subpath, changes, direction = 'push') {
  if (changes.modified.length === 0) return

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'procyon-diff-'))
  try {
    console.log('\nContent differences:')
    for (const relativePath of changes.modified) {
      const localPath = safeJoin(rsync.buildLocal(subpath), relativePath)
      const remoteCopy = safeJoin(tempDir, relativePath)
      await rsync.fetchRemoteFile(path.posix.join(subpath, relativePath), remoteCopy)

      const oldPath = direction === 'push' ? remoteCopy : localPath
      const newPath = direction === 'push' ? localPath : remoteCopy
      const oldLabel = direction === 'push' ? `remote/${relativePath}` : `local/${relativePath}`
      const newLabel = direction === 'push' ? `local/${relativePath}` : `remote/${relativePath}`

      console.log(`\n${renderFileDiff(oldPath, newPath, { old: oldLabel, new: newLabel })}`)
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

module.exports = {
  MAX_TEXT_FILE_BYTES,
  displayContentDiffs,
  isBinary,
  renderFileDiff,
  safeJoin
}
