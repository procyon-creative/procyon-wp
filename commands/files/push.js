const { RsyncTransfer, ConnectionError, displayDiff } = require('../../src/sync/rsync')
const { getEnvironment } = require('../../src/config/store')
const { createBackup } = require('../../src/sync/backup')
const { prompt } = require('enquirer')
const { FILE_DIFF_OPTIONS, buildTransferSubpaths, runReadOnlyDiff } = require('./shared')

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
    ...FILE_DIFF_OPTIONS,
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

    const subpaths = buildTransferSubpaths(argv, project, { requireExistingPath: true })

    for (const { subpath, label, useDelete } of subpaths) {
      let changes = null

      if (argv.diff) {
        try {
          await runReadOnlyDiff(rsync, { subpath, label, useDelete }, 'push', argv)
        } catch (error) {
          console.error(`Error: ${error.message}`)
          throw error
        }
        continue
      }

      // --dry-run: show parsed diff and stop
      if (argv.dryRun) {
        console.log(`\nDry run for ${label}:`)
        try {
          changes = await rsync.dryRun(subpath, subpath, { delete: useDelete })
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
          changes = await rsync.dryRun(subpath, subpath, {
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

      // Skip backup when all files are new (nothing on remote to back up)
      const allNew = changes && changes.modified.length === 0 && changes.deleted.length === 0

      // Backup before pushing (unless --no-backup)
      if (!argv.noBackup && !allNew) {
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
