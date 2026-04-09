const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const { prompt } = require('enquirer')
const { getEnvironment } = require('../../src/config/store')
const { RsyncTransfer, shellQuote } = require('../../src/sync/rsync')

module.exports = {
  command: 'push <target> [-y]',
  describe: 'Push database to a target environment',
  builder: {
    target: {
      demandOption: true
    },
    y: {
      describe: 'Skip confirmation prompt',
      type: 'boolean'
    }
  },
  handler: async (argv) => {
    const project = argv.project
    const env = getEnvironment(project, argv.target)
    if (!env) {
      console.error(`Environment "${argv.target}" not found in project config.`)
      process.exit(1)
    }

    // Confirm unless -y
    if (!argv.y) {
      const { confirm } = await prompt({
        type: 'confirm',
        name: 'confirm',
        message: `Push local database to ${argv.target}? This will overwrite the remote database.`,
        initial: false
      })
      if (!confirm) {
        console.log('Operation cancelled.')
        return
      }
    }

    const rsync = new RsyncTransfer(project, env)
    const wpCli = project.wpCli || 'wp'

    // 1. Export local database
    console.log('Exporting local database...')
    await wpCmd(wpCli, ['db', 'export', 'db.sql'], project.localPath)

    // 2. Upload dump via rsync
    console.log('Uploading database dump...')
    await rsync.exec([
      '-chavzP', '--stats',
      '-e', rsync.buildSshCommand(),
      path.join(project.localPath, 'db.sql'),
      rsync.buildRemote('db.sql')
    ])

    // 3. Backup remote database
    console.log('Backing up remote database...')
    await rsync.ssh(`cd ${shellQuote(env.path)} && wp db export db-backup.sql`).catch(() => {})

    // 4. Import on remote
    console.log('Importing database on remote...')
    await rsync.ssh(`cd ${shellQuote(env.path)} && wp db import db.sql`)

    // 5. Search-replace domains
    if (project.localDomain) {
      const remoteDomain = env.domain || env.host
      console.log(`Replacing ${project.localDomain} → ${remoteDomain}...`)
      await rsync.ssh(`cd ${shellQuote(env.path)} && wp search-replace --all-tables ${shellQuote(project.localDomain)} ${shellQuote(remoteDomain)}`)
    } else {
      console.log('Skipping search-replace (no localDomain in project config)')
    }

    // 6. Cleanup
    const localDump = path.join(project.localPath, 'db.sql')
    if (fs.existsSync(localDump)) fs.unlinkSync(localDump)
    await rsync.ssh(`rm -f ${shellQuote(env.path + '/db.sql')}`).catch(() => {})

    console.log('Database push complete.')
  }
}

function wpCmd (wpCli, args, cwd) {
  const parts = wpCli.split(' ')
  return new Promise((resolve, reject) => {
    const child = spawn(parts[0], [...parts.slice(1), ...args], { stdio: 'inherit', cwd })
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`exit ${code}`)))
    child.on('error', reject)
  })
}
