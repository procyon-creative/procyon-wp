const fs = require('fs')
const path = require('path')
const { prompt } = require('enquirer')
const { saveProject } = require('../src/config/store')
const { lookupSshHost } = require('../src/ssh-config')

module.exports = {
  command: 'migrate',
  describe: 'Import configuration from existing .env file',
  builder: {
    env: {
      default: '.env',
      describe: 'Path to .env file'
    },
    y: {
      type: 'boolean',
      describe: 'Skip confirmation prompts'
    }
  },
  handler: async (argv) => {
    const envPath = path.resolve(argv.env)

    if (!fs.existsSync(envPath)) {
      console.error(`No .env file found at ${envPath}`)
      process.exit(1)
    }

    const envConfig = parseEnvFile(fs.readFileSync(envPath, 'utf8'))

    console.log('\nFound .env file with:')
    Object.entries(envConfig).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`)
    })

    if (!argv.y) {
      const { confirm } = await prompt({
        type: 'confirm',
        name: 'confirm',
        message: 'Import this configuration?'
      })

      if (!confirm) {
        console.log('Migration cancelled.')
        return
      }
    }

    let projectName = envConfig.SITE_NAME || path.basename(process.cwd())
    if (!argv.y) {
      const answer = await prompt({
        type: 'input',
        name: 'projectName',
        message: 'Project name:',
        initial: projectName
      })
      projectName = answer.projectName
    }

    console.log('\nParsing SSH strings...')

    let localPath = envConfig.LOCAL_PATH
    if (!localPath) {
      if (argv.y) {
        localPath = process.cwd()
      } else {
        const answer = await prompt({
          type: 'input',
          name: 'localPath',
          message: 'LOCAL_PATH not found in .env. Enter local WordPress path:',
          initial: process.cwd()
        })
        localPath = answer.localPath
      }
    }

    const config = {
      name: projectName,
      projectPath: process.cwd(),
      localPath,
      localDomain: envConfig.LOCAL_DOMAIN || undefined,
      wpCli: envConfig.LOCAL_DOMAIN?.includes('lndo') ? 'lando wp' : 'wp',
      environments: {}
    }

    if (envConfig.STAGING_SSH) {
      config.environments.staging = parseSSHString(envConfig.STAGING_SSH)
      config.environments.staging.path = envConfig.STAGING_PATH
      if (envConfig.STAGING_DOMAIN) {
        config.environments.staging.domain = envConfig.STAGING_DOMAIN
      }
      const s = config.environments.staging
      console.log(`  staging: ${envConfig.STAGING_SSH} -> host: ${s.host}, user: ${s.user}, port: ${s.port}`)
    }

    if (envConfig.LIVE_SSH) {
      config.environments.live = parseSSHString(envConfig.LIVE_SSH)
      config.environments.live.path = envConfig.LIVE_PATH
      if (envConfig.LIVE_DOMAIN) {
        config.environments.live.domain = envConfig.LIVE_DOMAIN
      }
      const l = config.environments.live
      console.log(`  live: ${envConfig.LIVE_SSH} -> host: ${l.host}, user: ${l.user}, port: ${l.port}`)
    }

    const configPath = saveProject(projectName, config)

    console.log(`\nCreated ${configPath}`)

    if (argv.y) {
      console.log('  (keeping .env as backup)')
    } else {
      const { deleteEnv } = await prompt({
        type: 'confirm',
        name: 'deleteEnv',
        message: 'Delete old .env file?',
        initial: false
      })

      if (deleteEnv) {
        fs.unlinkSync(envPath)
        console.log('Deleted .env')
      } else {
        console.log('  (keeping .env as backup)')
      }
    }

    console.log('\nMigration complete!')
  }
}

module.exports.parseEnvFile = parseEnvFile
module.exports.parseSSHString = parseSSHString

function parseEnvFile (content) {
  const result = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
    result[key] = value
  }
  return result
}

function parseSSHString (sshString) {
  let user, host
  let port = 22
  let identityFile

  if (sshString.includes('@')) {
    const [userPart, hostPart] = sshString.split('@')
    user = userPart

    if (hostPart.includes(':')) {
      [host, port] = hostPart.split(':')
      port = parseInt(port)
    } else {
      host = hostPart
    }
  } else {
    host = sshString
    user = require('os').userInfo().username
  }

  // Check ~/.ssh/config for this host alias — overrides defaults
  const sshEntry = lookupSshHost(host)
  if (sshEntry) {
    if (sshEntry.user) user = sshEntry.user
    if (sshEntry.port) port = sshEntry.port
    if (sshEntry.identityFile) identityFile = sshEntry.identityFile
  }

  const result = { host, user, port }
  if (identityFile) result.identityFile = identityFile
  return result
}
