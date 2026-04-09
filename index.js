#!/usr/bin/env node
const yargs = require('yargs/yargs')
const path = require('path')
const fs = require('fs')
const { getProjectFromCwd } = require('./src/config/store')

const log = (argv, message) => {
  if (argv.verbose) {
    console.log(message)
  }
}

// Commands that don't need any config loaded
const CONFIG_FREE_COMMANDS = ['init', 'migrate', 'projects', 'env']

const argv = yargs(process.argv.slice(2)) // eslint-disable-line no-unused-vars
  .scriptName('procyon')
  .option('verbose', {
    alias: 'v',
    type: 'boolean',
    description: 'Run with verbose logging'
  })
  .middleware(loadProjectMiddleware)
  .commandDir('commands')
  .demandCommand(1, '')
  .help()
  .argv

/**
 * Middleware: loads .procyon project config and attaches to argv
 */
function loadProjectMiddleware (argv) {
  const command = argv._[0]

  // Skip config loading for setup commands
  if (CONFIG_FREE_COMMANDS.includes(command)) {
    return argv
  }

  const project = getProjectFromCwd()
  if (!project) {
    console.error('No project config found for this directory.')
    console.error('Run `procyon init` to set up a project.')
    process.exit(1)
  }

  log(argv, `Using project config: ${project.name}`)
  argv.project = project
  loadOptionalConfig(argv)
  return argv
}

function loadOptionalConfig (argv) {
  const configPath = path.resolve(process.cwd(), 'config/procyon-config.json')
  if (fs.existsSync(configPath)) {
    log(argv, `Loading config from ${configPath}`)
    const config = require(configPath)
    argv.config = config
  }
}
