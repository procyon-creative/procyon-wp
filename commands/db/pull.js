const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const { getEnvironment } = require('../../src/config/store')
const { RsyncTransfer, shellQuote } = require('../../src/sync/rsync')

module.exports = {
  command: 'pull <target>',
  describe: 'Pull database from a target environment',
  builder: {
    target: {
      demandOption: true
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
    const wpCli = project.wpCli || 'wp'

    // WP Engine exports to uploads dir since home isn't writable
    const isWpe = env.path.includes('wpe-user')
    const remoteExportDir = isWpe ? `${env.path}/wp-content/uploads` : env.path
    const remoteDumpPath = `${remoteExportDir}/db.sql`

    // 1. Export database on remote
    console.log('Exporting remote database...')
    await rsync.ssh(`cd ${shellQuote(env.path)} && wp db export ${shellQuote(remoteDumpPath)}`)

    // 2. Download the dump via rsync (single file)
    console.log('Downloading database dump...')
    await rsync.exec([
      '-chavzP', '--stats',
      '-e', rsync.buildSshCommand(),
      rsync.buildRemote(remoteDumpPath.replace(env.path + '/', '')),
      path.join(project.localPath, 'db.sql')
    ])

    // 3. Backup local database
    console.log('Backing up local database...')
    fs.mkdirSync(path.join(project.localPath, '.tmp'), { recursive: true })
    await wpCmd(wpCli, ['db', 'export', '.tmp/db-backup.sql'], project.localPath)
      .catch(() => console.log('  (no existing local database)'))

    // 4. Reset and import
    console.log('Resetting local database...')
    await wpCmd(wpCli, ['db', 'reset', '--yes'], project.localPath)
      .catch(() => console.log('  (reset skipped — no existing database)'))

    console.log('Importing database...')
    await wpCmd(wpCli, ['db', 'import', 'db.sql'], project.localPath)

    // 5. Search-replace domains
    if (project.localDomain) {
      const remoteDomain = env.domain || env.host
      console.log(`Replacing ${remoteDomain} → ${project.localDomain}...`)
      await wpCmd(wpCli, ['search-replace', '--all-tables', remoteDomain, project.localDomain], project.localPath)
    } else {
      console.log('Skipping search-replace (no localDomain in project config)')
    }

    // 6. Cleanup
    await wpCmd(wpCli, ['transient', 'delete', '--all'], project.localPath).catch(() => {})
    const localDump = path.join(project.localPath, 'db.sql')
    if (fs.existsSync(localDump)) fs.unlinkSync(localDump)
    await rsync.ssh(`rm -f ${shellQuote(remoteDumpPath)}`).catch(() => {})

    console.log('Database pull complete.')
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
