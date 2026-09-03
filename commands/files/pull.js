const { RsyncTransfer, ConnectionError, displayDiff } = require('../../src/sync/rsync')
const { getEnvironment } = require('../../src/config/store')
const { FILE_DIFF_OPTIONS, buildTransferSubpaths, runReadOnlyDiff } = require('./shared')

module.exports = {
  command: 'pull <target> [item] [name]',
  describe: 'Pull files from an environment. Use item shortcuts (themes/plugins/uploads) or --path for any directory.',
  builder: (yargs) => yargs
    .positional('target', {
      type: 'string',
      describe: 'Environment to pull from (e.g. staging, live)'
    })
    .positional('item', {
      describe: 'What to pull',
      default: 'uploads',
      choices: ['themes', 'plugins', 'uploads', 'all']
    })
    .positional('name', {
      type: 'string',
      describe: 'Pull a single theme or plugin by name'
    })
    .option('path', {
      type: 'string',
      describe: 'Pull an arbitrary directory path (relative to WP root)'
    })
    .option('dry-run', {
      type: 'boolean',
      describe: 'Preview changes without transferring',
      default: false
    })
    .options(FILE_DIFF_OPTIONS),
  handler: async (argv) => {
    const project = argv.project
    const env = getEnvironment(project, argv.target)
    if (!env) {
      console.error(`Environment "${argv.target}" not found in project config.`)
      process.exit(1)
    }

    const rsync = new RsyncTransfer(project, env)

    const subpaths = buildTransferSubpaths(argv, project)

    for (const { subpath, label, useDelete } of subpaths) {
      if (argv.diff) {
        try {
          await runReadOnlyDiff(rsync, { subpath, label, useDelete }, 'pull', argv)
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
