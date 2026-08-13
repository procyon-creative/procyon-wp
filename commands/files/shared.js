const fs = require('fs')
const path = require('path')
const { displayDiff } = require('../../src/sync/rsync')
const { displayContentDiffs } = require('../../src/sync/file-diff')

const ITEM_PATHS = {
  themes: 'wp-content/themes',
  plugins: 'wp-content/plugins',
  uploads: 'wp-content/uploads'
}

const FILE_DIFF_OPTIONS = {
  diff: {
    type: 'boolean',
    describe: 'Show line-by-line content differences without transferring files',
    default: false
  },
  'diff-depth': {
    type: 'number',
    describe: 'Limit --diff directory traversal depth'
  },
  'diff-limit': {
    type: 'number',
    describe: 'Maximum modified files to render with --diff',
    default: 200
  }
}

function validateProjectPath (localPath, relativePath) {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`--path must be relative to localPath (${localPath})`)
  }

  const resolvedRoot = path.resolve(localPath)
  const resolvedPath = path.resolve(resolvedRoot, relativePath)
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`--path must stay within localPath (${localPath})`)
  }

  return resolvedPath
}

function buildTransferSubpaths (argv, project, options = {}) {
  if (argv.path) {
    const fullPath = validateProjectPath(project.localPath, argv.path)
    if (options.requireExistingPath && !fs.existsSync(fullPath)) {
      throw new Error(`Path not found: ${fullPath}`)
    }
    return [{ subpath: argv.path, label: argv.path, useDelete: true }]
  }

  const items = argv.item === 'all' ? ['themes', 'plugins', 'uploads'] : [argv.item]
  return items.map(item => {
    let subpath = ITEM_PATHS[item]
    if (argv.name) subpath = `${subpath}/${argv.name}`
    return {
      subpath,
      label: `${item}${argv.name ? ` (${argv.name})` : ''}`,
      useDelete: item !== 'uploads'
    }
  })
}

async function runReadOnlyDiff (rsync, transfer, direction, argv) {
  const { subpath, label, useDelete } = transfer
  console.log(`\nRead-only diff for ${label}:`)
  const changes = await rsync.dryRun(subpath, subpath, {
    direction,
    delete: useDelete,
    maxDepth: argv.diffDepth
  })
  displayDiff(changes, direction, { readOnly: true })
  await displayContentDiffs(rsync, subpath, changes, direction, { limit: argv.diffLimit })
}

module.exports = {
  FILE_DIFF_OPTIONS,
  buildTransferSubpaths,
  runReadOnlyDiff,
  validateProjectPath
}
