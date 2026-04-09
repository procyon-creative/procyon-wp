const fs = require('fs')
const path = require('path')
const os = require('os')
const SSHConfig = require('ssh-config')

/**
 * Look up a host in ~/.ssh/config and return the computed config.
 * Returns null if no config file or no matching host.
 */
function lookupSshHost (host, configPath) {
  if (!configPath) configPath = path.join(os.homedir(), '.ssh', 'config')
  if (!fs.existsSync(configPath)) return null

  const config = SSHConfig.parse(fs.readFileSync(configPath, 'utf8'))
  const computed = config.compute(host)

  // SSH config keys are case-insensitive; the library preserves
  // whatever casing the user wrote (HostName vs Hostname, etc.)
  const get = (key) => {
    const lower = key.toLowerCase()
    const match = Object.keys(computed).find(k => k.toLowerCase() === lower)
    return match ? computed[match] : undefined
  }

  // If no Hostname was resolved, the host wasn't explicitly defined
  const hostname = get('hostname')
  if (!hostname) return null

  const identityFile = get('identityfile')
  const port = get('port')

  return {
    hostname,
    user: get('user') || null,
    port: port ? parseInt(port) : null,
    identityFile: Array.isArray(identityFile)
      ? identityFile[0]
      : identityFile || null
  }
}

module.exports = { lookupSshHost }
