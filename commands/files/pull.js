const path = require('path')
const { RsyncTransfer, ConnectionError, displayDiff } = require('../../src/sync/rsync')
const { getEnvironment } = require('../../src/config/store')

const ITEM_PATHS = {
  themes: 'wp-content/themes',
  plugins: 'wp-content/plugins',
  uploads: 'wp-content/uploads'
}

module.exports = {
  command: 'pull <target> [item] [name]',
  describe: 'Pull files from an environment. Use item shortcuts (themes/plugins/uploads) or --path for any directory.',
  builder: {
    target: {
      demandOption: true
    },
    item: {
      default: 'uploads',
      choices: ['themes', 'plugins', 'uploads', 'all']
    },
    name: {
      type: 'string',
      describe: 'Pull a single theme or plugin by name'
    },
    path: {
      type: 'string',
      describe: 'Pull an arbitrary directory path (relative to WP root)'
    },
    'dry-run': {
      type: 'boolean',
      describe: 'Preview changes without transferring',
      default: false
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

    // Build list of subpaths to pull
    const subpaths = []
    if (argv.path) {
      if (path.isAbsolute(argv.path)) {
        console.error(`--path must be relative to localPath (${project.localPath})`)
        process.exit(1)
      }
      subpaths.push({ subpath: argv.path, label: argv.path, useDelete: true })
    } else {
      const items = argv.item === 'all' ? ['themes', 'plugins', 'uploads'] : [argv.item]
      for (const item of items) {
        let subpath = ITEM_PATHS[item]
        if (argv.name) subpath = `${subpath}/${argv.name}`
        subpaths.push({ subpath, label: `${item}${argv.name ? ` (${argv.name})` : ''}`, useDelete: item !== 'uploads' })
      }
    }

    for (const { subpath, label, useDelete } of subpaths) {
      // --dry-run: show parsed diff and stop
      if (argv.dryRun) {
        console.log(`\nDry run for ${label}:`)
        try {
          const changes = await rsync.dryRun(subpath, subpath, {
            direction: 'pull',
            delete: useDelete
          })
          displayDiff(changes, 'pull')
        } catch (error) {
          console.error(`Error: ${error.message}`)
          if (error instanceof ConnectionError) process.exit(1)
        }
        continue
      }

      console.log(`Pulling ${label}...`)

      try {
        await rsync.pull(subpath, subpath, {
          delete: useDelete
        })
      } catch (error) {
        console.error(`Error pulling ${label}:`, error.message)
        if (error instanceof ConnectionError) {
          console.error('Connection failed. Aborting.')
          process.exit(1)
        }
      }
    }
  }
}
