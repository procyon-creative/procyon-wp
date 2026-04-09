const path = require('path')
const fs = require('fs')
const { RsyncTransfer, ConnectionError, displayDiff } = require('../../src/sync/rsync')
const { getEnvironment } = require('../../src/config/store')
const { createBackup } = require('../../src/sync/backup')
const { prompt } = require('enquirer')

const ITEM_PATHS = {
  themes: 'wp-content/themes',
  plugins: 'wp-content/plugins',
  uploads: 'wp-content/uploads'
}

module.exports = {
  command: 'push <target> [item] [name]',
  describe: 'Push files to an environment. Use item shortcuts (themes/plugins/uploads) or --path for any directory.',
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
      describe: 'Push a single theme or plugin by name'
    },
    path: {
      type: 'string',
      describe: 'Push an arbitrary directory path (relative to WP root)'
    },
    'dry-run': {
      type: 'boolean',
      describe: 'Preview changes without transferring',
      default: false
    },
    y: {
      type: 'boolean',
      describe: 'Skip confirmation prompts'
    },
    'no-backup': {
      type: 'boolean',
      describe: 'Skip pre-push backup',
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

    // Build list of subpaths to push
    const subpaths = []
    if (argv.path) {
      if (path.isAbsolute(argv.path)) {
        console.error(`--path must be relative to localPath (${project.localPath})`)
        process.exit(1)
      }
      const fullPath = path.join(project.localPath, argv.path)
      if (!fs.existsSync(fullPath)) {
        console.error(`Path not found: ${fullPath}`)
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
          const changes = await rsync.dryRun(subpath, subpath, { delete: useDelete })
          displayDiff(changes, 'push')
        } catch (error) {
          console.error(`Error: ${error.message}`)
          if (error instanceof ConnectionError) process.exit(1)
        }
        continue
      }

      // Show diff preview before pushing (unless -y)
      if (!argv.y) {
        console.log(`\nPreviewing changes for ${label}...`)
        try {
          const changes = await rsync.dryRun(subpath, subpath, {
            delete: useDelete
          })

          if (!displayDiff(changes, 'push')) {
            console.log('No changes to push.')
            continue
          }

          const { confirm } = await prompt({
            type: 'confirm',
            name: 'confirm',
            message: 'Proceed with push?'
          })

          if (!confirm) {
            console.log('Skipped.')
            continue
          }
        } catch (error) {
          console.error(`Error generating preview: ${error.message}`)
          if (error instanceof ConnectionError) {
            console.error('Connection failed. Aborting.')
            process.exit(1)
          }
          console.error('Continuing without preview...')
        }
      }

      // Backup before pushing (unless --no-backup)
      if (!argv.noBackup) {
        const backupLabel = argv.path ? argv.path.replace(/\//g, '-') : subpath.split('/').pop()
        try {
          await createBackup(rsync, project, argv.target, subpath, backupLabel)
        } catch (error) {
          console.error(`Backup failed: ${error.message}`)
          if (error instanceof ConnectionError) {
            console.error('Connection failed. Aborting.')
            process.exit(1)
          }
          if (!argv.y) {
            const { proceed } = await prompt({
              type: 'confirm',
              name: 'proceed',
              message: 'Backup failed. Continue without backup?',
              initial: false
            })
            if (!proceed) continue
          }
        }
      }

      console.log(`Pushing ${label}...`)

      try {
        await rsync.push(subpath, subpath, {
          delete: useDelete
        })
      } catch (error) {
        console.error(`Error pushing ${label}:`, error.message)
        if (error instanceof ConnectionError) {
          console.error('Connection failed. Aborting.')
          process.exit(1)
        }
      }
    }
  }
}
