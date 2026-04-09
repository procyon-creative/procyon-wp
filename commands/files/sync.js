const fs = require('fs')
const path = require('path')
const { RsyncTransfer } = require('../../src/sync/rsync')
const { getEnvironment } = require('../../src/config/store')
const { prompt } = require('enquirer')

const PLUGINS_PATH = 'wp-content/plugins'
const MU_PLUGINS_PATH = 'wp-content/mu-plugins'

module.exports = {
  command: 'sync <target>',
  describe: 'Compare local and remote plugins, then selectively sync.',
  builder: {
    target: {
      demandOption: true
    },
    prefer: {
      type: 'string',
      choices: ['local', 'remote'],
      default: 'remote',
      describe: 'Preferred sync direction'
    },
    'missing-only': {
      type: 'boolean',
      default: false,
      describe: 'Only sync plugins missing on one side'
    },
    'skip-mu': {
      type: 'boolean',
      default: true,
      describe: 'Skip mu-plugins directory'
    },
    'rsync-exclude': {
      type: 'string',
      describe: 'Exclude patterns: path to file or comma-separated patterns'
    },
    'dry-run': {
      type: 'boolean',
      default: false,
      describe: 'Preview changes without transferring'
    },
    y: {
      type: 'boolean',
      describe: 'Skip confirmation prompt, sync all'
    }
  },
  handler: async (argv) => {
    const project = argv.project
    const env = getEnvironment(project, argv.target)
    if (!env) {
      console.error(`Environment "${argv.target}" not found in project config.`)
      process.exit(1)
    }

    const rsync = new RsyncTransfer(project, env)
    const excludeArgs = buildExcludeArgs(argv.rsyncExclude)
    const dirs = [PLUGINS_PATH]
    if (!argv.skipMu) dirs.push(MU_PLUGINS_PATH)

    for (const pluginDir of dirs) {
      const label = pluginDir === MU_PLUGINS_PATH ? 'mu-plugins' : 'plugins'
      console.log(`\nScanning ${label}...`)

      // List local and remote plugin folders
      const localPlugins = listLocalPlugins(project.localPath, pluginDir)
      const remotePlugins = await listRemotePlugins(rsync, pluginDir)

      // Categorize
      const allNames = [...new Set([...localPlugins, ...remotePlugins])].sort()
      const missingLocal = allNames.filter(p => !localPlugins.includes(p))
      const missingRemote = allNames.filter(p => !remotePlugins.includes(p))
      const common = allNames.filter(p => localPlugins.includes(p) && remotePlugins.includes(p))

      // For common plugins, detect which have differences via a single dry-run
      let changed = []
      if (!argv.missingOnly && common.length > 0) {
        console.log(`Comparing ${common.length} shared plugins...`)
        changed = await detectChangedPlugins(rsync, pluginDir, common, excludeArgs)
      }

      // Display summary
      if (missingLocal.length === 0 && missingRemote.length === 0 && changed.length === 0) {
        console.log(`All ${label} are in sync.`)
        continue
      }

      console.log(`\n${label} sync summary (prefer: ${argv.prefer}):`)

      if (missingLocal.length > 0) {
        console.log('\n  Missing locally (only on remote):')
        for (const p of missingLocal) console.log(`    + ${p}`)
      }

      if (missingRemote.length > 0) {
        console.log('\n  Missing on remote (only local):')
        for (const p of missingRemote) console.log(`    + ${p}`)
      }

      if (changed.length > 0) {
        console.log('\n  Different versions:')
        for (const p of changed) console.log(`    ~ ${p}`)
      }

      // Build sync plan based on --prefer
      const plan = []

      if (argv.prefer === 'remote') {
        // Pull missing-local and changed from remote
        for (const p of missingLocal) plan.push({ plugin: p, direction: 'pull' })
        for (const p of changed) plan.push({ plugin: p, direction: 'pull' })
        // Push missing-remote to remote
        for (const p of missingRemote) plan.push({ plugin: p, direction: 'push' })
      } else {
        // Push missing-remote and changed to remote
        for (const p of missingRemote) plan.push({ plugin: p, direction: 'push' })
        for (const p of changed) plan.push({ plugin: p, direction: 'push' })
        // Pull missing-local from remote
        for (const p of missingLocal) plan.push({ plugin: p, direction: 'pull' })
      }

      if (plan.length === 0) continue

      // In dry-run mode, just show what would happen
      if (argv.dryRun) {
        console.log('\nDry run — would sync:')
        for (const { plugin, direction } of plan) {
          console.log(`  ${direction === 'pull' ? '↓' : '↑'} ${plugin} (${direction})`)
        }
        continue
      }

      let selectedPlan = plan

      if (!argv.y) {
        // Let user select which plugins to sync
        const choices = plan.map(({ plugin, direction }) => ({
          name: plugin,
          message: `${direction === 'pull' ? '↓' : '↑'} ${plugin} (${direction})`,
          value: plugin
        }))

        const { selected } = await prompt({
          type: 'multiselect',
          name: 'selected',
          message: 'Select plugins to sync:',
          choices,
          initial: choices.map(c => c.name)
        })

        if (selected.length === 0) {
          console.log('Nothing selected.')
          continue
        }

        selectedPlan = plan.filter(p => selected.includes(p.plugin))
      }
      for (const { plugin, direction } of selectedPlan) {
        const subpath = `${pluginDir}/${plugin}`
        const rsyncOpts = { delete: true, noDefaultExclude: true, excludeArgs }

        console.log(`${direction === 'pull' ? 'Pulling' : 'Pushing'} ${plugin}...`)
        try {
          if (direction === 'pull') {
            await rsync.pull(subpath, subpath, rsyncOpts)
          } else {
            await rsync.push(subpath, subpath, rsyncOpts)
          }
        } catch (error) {
          console.error(`  Error syncing ${plugin}: ${error.message}`)
        }
      }

      console.log(`\n${label} sync complete.`)
    }
  }
}

function listLocalPlugins (localPath, pluginDir) {
  const dir = path.join(localPath, pluginDir)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(f => {
      const full = path.join(dir, f)
      return fs.statSync(full).isDirectory() && !f.startsWith('.')
    })
    .sort()
}

async function listRemotePlugins (rsync, pluginDir) {
  const remotePath = `${rsync.env.path}/${pluginDir}`
  const output = await rsync.ssh(`ls -1p ${remotePath}`, { capture: true })
  return output.trim().split('\n')
    .filter(f => f.endsWith('/') && !f.startsWith('.'))
    .map(f => f.replace(/\/$/, ''))
    .sort()
}

/**
 * Do a single dry-run of the whole plugins dir, then group changed files
 * by their top-level plugin folder. Returns names of plugins with differences.
 */
async function detectChangedPlugins (rsync, pluginDir, common, excludeArgs) {
  try {
    const changes = await rsync.dryRun(pluginDir, pluginDir, {
      direction: 'pull',
      delete: true,
      noDefaultExclude: true,
      excludeArgs
    })

    const allFiles = [...changes.added, ...changes.modified, ...changes.deleted]
    const changedPlugins = new Set()

    for (const file of allFiles) {
      // Files are relative to the plugins dir, e.g. "acf/acf.php"
      const topDir = file.split('/')[0]
      if (common.includes(topDir)) {
        changedPlugins.add(topDir)
      }
    }

    return [...changedPlugins].sort()
  } catch {
    console.error('Warning: could not compare plugins, skipping diff check.')
    return []
  }
}

function buildExcludeArgs (rsyncExclude) {
  if (!rsyncExclude) return []

  // If it looks like a file path (no commas, has extension or starts with / or .)
  if (!rsyncExclude.includes(',') && (rsyncExclude.startsWith('/') || rsyncExclude.startsWith('.'))) {
    const resolved = path.resolve(rsyncExclude)
    if (fs.existsSync(resolved)) {
      return ['--exclude-from', resolved]
    }
    console.error(`Warning: exclude file not found: ${resolved}`)
    return []
  }

  // Comma-separated patterns
  return rsyncExclude.split(',')
    .map(p => p.trim())
    .filter(Boolean)
    .flatMap(p => ['--exclude', p])
}
