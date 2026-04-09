const fs = require('fs')
const csv = require('csv-parser')
const { execSync } = require('child_process')

// Function to execute WP-CLI command
function installPlugin (wpCommand, name, version, isActive) {
  let command = `${wpCommand} plugin install "${name}" --version="${version}" --force`
  if (isActive) {
    command += ' --activate'
  }

  console.log(command)
  try {
    const output = execSync(command, { stdio: 'pipe' }).toString()
    if (output.includes('Success')) {
      return `Success,${name},${version}`
    } else {
      return `Unknown,${name},${version}`
    }
  } catch (error) {
    return `Error,${name},${version}`
  }
}

// Main function to process the CSV file
function processCSV (wpCommand, filePath) {
  const results = []

  fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', (row) => {
      if (row.name && row.name !== 'name') {
        const version = row.version.replace(/\r/g, '') // Remove carriage returns
        const status = installPlugin(wpCommand, row.name, version, row.status === 'active')
        results.push(status)
      }
    })
    .on('end', () => {
      console.log('status,name,version,message')
      results.forEach(result => console.log(result))
    })
}

module.exports = {
  command: 'plugin-install <target> [csv]',
  describe: 'Install and activate plugins on a server from a CSV file',
  builder: {
    server: {
    },
    csv: {
      default: 'plugins.csv',
      require: false
    }
  },
  handler: (argv) => {
    const wpCommand = argv.project.wpCli || 'wp'
    processCSV(wpCommand, argv.csv)
  }
}
