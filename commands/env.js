const { prompt } = require('enquirer')
const {
  getProject,
  getProjectFromCwd,
  addEnvironment,
  updateEnvironment,
  removeEnvironment
} = require('../src/config/store')

function resolveProject (argv) {
  if (argv.project && argv.project.name) return argv.project.name
  const fromCwd = getProjectFromCwd()
  if (fromCwd) return fromCwd.name
  return null
}

let _yargs

function requireName (argv) {
  if (!argv.name) {
    _yargs.showHelp()
    console.error(`\nMissing environment name: procyon env ${argv.action} <name>`)
    process.exit(1)
  }
}

module.exports = {
  command: 'env <action> [name]',
  describe: 'Manage environments for a project',
  builder: (yargs) => {
    _yargs = yargs
    yargs.positional('action', {
      choices: ['list', 'add', 'edit', 'remove'],
      describe: 'Action to perform'
    })
    yargs.positional('name', {
      type: 'string',
      describe: 'Environment name (e.g. staging, live)'
    })
    yargs.option('host', { type: 'string', describe: 'SSH host' })
    yargs.option('user', { type: 'string', describe: 'SSH user' })
    yargs.option('port', { type: 'number', describe: 'SSH port' })
    yargs.option('path', { type: 'string', describe: 'Remote path' })
    yargs.option('domain', { type: 'string', describe: 'Site domain (for db search-replace)' })
    yargs.option('identityFile', { type: 'string', describe: 'SSH identity file' })
    yargs.option('y', { type: 'boolean', describe: 'Skip confirmation prompts' })
  },
  handler: async (argv) => {
    const projectName = resolveProject(argv)
    if (!projectName) {
      console.error('No project found. Run from a project directory or use `procyon init`.')
      process.exit(1)
    }

    const project = getProject(projectName)

    if (argv.action === 'list') {
      const envs = Object.entries(project.environments || {})
      if (envs.length === 0) {
        console.log(`No environments for "${projectName}".`)
        return
      }
      for (const [name, env] of envs) {
        console.log(`\n  ${name}`)
        console.log(`    Host: ${env.host}`)
        console.log(`    User: ${env.user}`)
        console.log(`    Port: ${env.port || 22}`)
        console.log(`    Path: ${env.path}`)
        if (env.domain) console.log(`    Domain: ${env.domain}`)
        if (env.identityFile) console.log(`    Key: ${env.identityFile}`)
      }
      console.log()
      return
    }

    if (argv.action === 'add') {
      requireName(argv)

      const env = await collectEnvFields(argv)

      addEnvironment(projectName, argv.name, env)
      console.log(`Added environment "${argv.name}" to ${projectName}.`)
      return
    }

    if (argv.action === 'edit') {
      requireName(argv)

      const existing = project.environments[argv.name]
      if (!existing) {
        console.error(`Environment "${argv.name}" not found in ${projectName}.`)
        process.exit(1)
      }

      const updates = collectEnvFlags(argv)
      if (Object.keys(updates).length === 0) {
        // Interactive edit with existing values as defaults
        const env = await promptEnvFields(existing)
        updateEnvironment(projectName, argv.name, env)
      } else {
        updateEnvironment(projectName, argv.name, updates)
      }
      console.log(`Updated environment "${argv.name}" in ${projectName}.`)
      return
    }

    if (argv.action === 'remove') {
      requireName(argv)

      if (!argv.y) {
        const { confirm } = await prompt({
          type: 'confirm',
          name: 'confirm',
          message: `Remove environment "${argv.name}" from ${projectName}?`,
          initial: false
        })
        if (!confirm) return
      }

      removeEnvironment(projectName, argv.name)
      console.log(`Removed environment "${argv.name}" from ${projectName}.`)
    }
  }
}

/**
 * Build env config from CLI flags if provided, otherwise prompt interactively.
 */
async function collectEnvFields (argv) {
  const fromFlags = collectEnvFlags(argv)
  if (fromFlags.host && fromFlags.user && fromFlags.path) {
    return { port: 22, ...fromFlags }
  }
  return promptEnvFields(fromFlags)
}

/**
 * Extract env fields from argv flags (non-interactive).
 */
function collectEnvFlags (argv) {
  const env = {}
  if (argv.host) env.host = argv.host
  if (argv.user) env.user = argv.user
  if (argv.port) env.port = argv.port
  if (argv.path) env.path = argv.path
  if (argv.domain) env.domain = argv.domain
  if (argv.identityFile) env.identityFile = argv.identityFile
  return env
}

/**
 * Prompt for env fields interactively with optional defaults.
 */
async function promptEnvFields (defaults = {}) {
  const answers = await prompt([
    { type: 'input', name: 'host', message: 'SSH host:', initial: defaults.host || '' },
    { type: 'input', name: 'user', message: 'SSH user:', initial: defaults.user || '' },
    { type: 'input', name: 'port', message: 'SSH port:', initial: String(defaults.port || 22) },
    { type: 'input', name: 'path', message: 'Remote path:', initial: defaults.path || '' },
    { type: 'input', name: 'domain', message: 'Site domain (optional):', initial: defaults.domain || '' },
    { type: 'input', name: 'identityFile', message: 'SSH identity file (optional):', initial: defaults.identityFile || '' }
  ])

  const env = {
    host: answers.host,
    user: answers.user,
    port: parseInt(answers.port),
    path: answers.path
  }
  if (answers.domain) env.domain = answers.domain
  if (answers.identityFile) env.identityFile = answers.identityFile
  return env
}
