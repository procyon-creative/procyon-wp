const { prompt } = require('enquirer')
const { listProjects, removeProject, getProjectFromCwd } = require('../src/config/store')

module.exports = {
  command: 'projects [action]',
  describe: 'List and manage registered projects',
  builder: {
    action: {
      choices: ['list', 'show', 'remove'],
      default: 'list'
    },
    name: {
      type: 'string',
      describe: 'Project name (for remove)'
    },
    y: {
      type: 'boolean',
      describe: 'Skip confirmation prompt'
    }
  },
  handler: async (argv) => {
    if (argv.action === 'list') {
      const projects = listProjects()
      if (projects.length === 0) {
        console.log('No projects registered. Run `procyon init` to set one up.')
        return
      }
      console.log('Registered projects:\n')
      for (const { name, config } of projects) {
        const envs = Object.keys(config.environments || {}).join(', ')
        console.log(`  ${name}`)
        console.log(`    Project: ${config.projectPath}`)
        console.log(`    Webroot: ${config.localPath}`)
        console.log(`    Environments: ${envs || 'none'}`)
        console.log()
      }
    }

    if (argv.action === 'show') {
      const project = getProjectFromCwd()
      if (!project) {
        console.error('No project config found for this directory.')
        console.error('Run `procyon init` or cd to a project directory.')
        process.exit(1)
      }
      console.log(JSON.stringify(project, null, 2))
    }

    if (argv.action === 'remove') {
      const name = argv.name
      if (!name) {
        console.error('Specify a project name: procyon projects remove --name <name>')
        process.exit(1)
      }
      if (!argv.y) {
        const { confirm } = await prompt({
          type: 'confirm',
          name: 'confirm',
          message: `Remove project "${name}"?`,
          initial: false
        })
        if (!confirm) return
      }
      if (removeProject(name)) {
        console.log(`Removed project "${name}"`)
      } else {
        console.error(`Project "${name}" not found`)
      }
    }
  }
}
