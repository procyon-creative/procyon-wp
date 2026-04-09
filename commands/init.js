const fs = require('fs')
const path = require('path')
const { prompt } = require('enquirer')
const { saveProject, getProjectFromCwd } = require('../src/config/store')

module.exports = {
  command: 'init',
  describe: 'Set up a new project configuration',
  builder: {},
  handler: async (argv) => {
    // Check if already initialized
    const existing = getProjectFromCwd()
    if (existing) {
      const { overwrite } = await prompt({
        type: 'confirm',
        name: 'overwrite',
        message: `This directory is already linked to project "${existing.name}". Overwrite?`,
        initial: false
      })
      if (!overwrite) return
    }

    // Check for existing .env to suggest migration
    if (fs.existsSync(path.resolve('.env'))) {
      console.log('Found existing .env file. You can also use `procyon migrate` to import it.')
    }

    const { projectName } = await prompt({
      type: 'input',
      name: 'projectName',
      message: 'Project name:',
      initial: path.basename(process.cwd())
    })

    const { localPath } = await prompt({
      type: 'input',
      name: 'localPath',
      message: 'Local WordPress path:',
      initial: process.cwd()
    })

    const { localDomain } = await prompt({
      type: 'input',
      name: 'localDomain',
      message: 'Local domain (for db search-replace):',
      initial: ''
    })

    const { wpCli } = await prompt({
      type: 'select',
      name: 'wpCli',
      message: 'WP-CLI command:',
      choices: ['wp', 'lando wp']
    })

    const environments = {}

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { addEnv } = await prompt({
        type: 'confirm',
        name: 'addEnv',
        message: Object.keys(environments).length === 0
          ? 'Add an environment?'
          : 'Add another environment?'
      })

      if (!addEnv) break

      const envAnswers = await prompt([
        {
          type: 'input',
          name: 'envName',
          message: 'Environment name:',
          initial: Object.keys(environments).length === 0 ? 'staging' : 'live'
        },
        {
          type: 'input',
          name: 'host',
          message: 'SSH host:'
        },
        {
          type: 'input',
          name: 'user',
          message: 'SSH user:',
          initial: 'deploy'
        },
        {
          type: 'input',
          name: 'port',
          message: 'SSH port:',
          initial: '22'
        },
        {
          type: 'input',
          name: 'remotePath',
          message: 'Remote path:'
        },
        {
          type: 'input',
          name: 'domain',
          message: 'Site domain (for db search-replace):',
          initial: ''
        },
        {
          type: 'input',
          name: 'identityFile',
          message: 'SSH identity file (leave blank for default):'
        }
      ])

      const env = {
        host: envAnswers.host,
        user: envAnswers.user,
        port: parseInt(envAnswers.port),
        path: envAnswers.remotePath
      }

      if (envAnswers.domain) {
        env.domain = envAnswers.domain
      }
      if (envAnswers.identityFile) {
        env.identityFile = envAnswers.identityFile
      }

      environments[envAnswers.envName] = env
    }

    const config = {
      name: projectName,
      projectPath: process.cwd(),
      localPath,
      wpCli,
      environments
    }

    if (localDomain) {
      config.localDomain = localDomain
    }

    const configPath = saveProject(projectName, config)

    console.log(`\nCreated ${configPath}`)

    if (Object.keys(environments).length > 0) {
      const firstEnv = Object.keys(environments)[0]
      console.log(`\nRun 'procyon files pull ${firstEnv} uploads' to sync uploads.`)
    }
  }
}
