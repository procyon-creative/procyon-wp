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

function validateContentLimit (contentModified, limit = 200) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('--diff-limit must be a positive integer')
  }
  if (contentModified.length > limit) {
    throw new Error(
      `Diff contains ${contentModified.length} modified files; limit is ${limit}. ` +
      `Use --diff-limit ${contentModified.length} to continue.`
    )
  }
}

function buildComparisons (rsync, subpath, relativePaths, tempDir) {
  const localRoot = rsync.buildLocal(subpath)
  return relativePaths.map(relativePath => ({
    relativePath,
    localPath: safeJoin(localRoot, relativePath),
    remoteCopy: safeJoin(tempDir, relativePath)
  }))
}

function renderComparisons (comparisons, direction) {
  console.log('\nContent differences:')
  for (const { relativePath, localPath, remoteCopy } of comparisons) {
    const oldPath = direction === 'push' ? remoteCopy : localPath
    const newPath = direction === 'push' ? localPath : remoteCopy
    const oldLabel = direction === 'push' ? `remote/${relativePath}` : `local/${relativePath}`
    const newLabel = direction === 'push' ? `local/${relativePath}` : `remote/${relativePath}`

    console.log(`\n${renderFileDiff(oldPath, newPath, { old: oldLabel, new: newLabel })}`)
  }
}

async function displayContentDiffs (rsync, subpath, changes, direction = 'push', options = {}) {
  const contentModified = changes.contentModified ?? changes.modified
  if (contentModified.length === 0) return
  validateContentLimit(contentModified, options.limit)

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'procyon-diff-'))
  try {
    const comparisons = buildComparisons(rsync, subpath, contentModified, tempDir)
    await rsync.fetchRemoteFiles(subpath, contentModified, tempDir)
    renderComparisons(comparisons, direction)
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
