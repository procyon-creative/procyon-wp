const REQUIRED_PROJECT_FIELDS = ['name', 'projectPath', 'localPath', 'environments']
const REQUIRED_ENV_FIELDS = ['host', 'user', 'path']

function validateProject (config) {
  const errors = []

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Config must be an object'] }
  }

  for (const field of REQUIRED_PROJECT_FIELDS) {
    if (!config[field]) {
      errors.push(`Missing required field: ${field}`)
    }
  }

  if (config.environments) {
    if (typeof config.environments !== 'object' || Array.isArray(config.environments)) {
      errors.push('environments must be an object')
    } else {
      for (const [envName, env] of Object.entries(config.environments)) {
        if (!env || typeof env !== 'object') {
          errors.push(`Environment "${envName}" must be an object`)
          continue
        }
        for (const field of REQUIRED_ENV_FIELDS) {
          if (!env[field]) {
            errors.push(`Environment "${envName}" missing required field: ${field}`)
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

module.exports = { validateProject }
