const os = require('os')
const path = require('path')
const fs = require('fs')
const { validateProject } = require('./schema')

const paths = {
  procyonDir: path.join(os.homedir(), '.procyon'),
  projectsDir: path.join(os.homedir(), '.procyon', 'projects')
}

function ensureConfigDir () {
  if (!fs.existsSync(paths.projectsDir)) {
    fs.mkdirSync(paths.projectsDir, { recursive: true })
  }
}

function getProject (name) {
  const filePath = path.join(paths.projectsDir, `${name}.json`)
  if (!fs.existsSync(filePath)) {
    return null
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function saveProject (name, config) {
  ensureConfigDir()
  const result = validateProject(config)
  if (!result.valid) {
    throw new Error(`Invalid config: ${result.errors.join(', ')}`)
  }
  const filePath = path.join(paths.projectsDir, `${name}.json`)
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2))
  return filePath
}

function listProjects () {
  ensureConfigDir()
  const files = fs.readdirSync(paths.projectsDir).filter(f => f.endsWith('.json'))
  return files.map(f => {
    const config = JSON.parse(fs.readFileSync(path.join(paths.projectsDir, f), 'utf8'))
    return { name: path.basename(f, '.json'), config }
  })
}

function removeProject (name) {
  const filePath = path.join(paths.projectsDir, `${name}.json`)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
    return true
  }
  return false
}

function getProjectFromCwd (cwd) {
  const dir = cwd || process.cwd()
  ensureConfigDir()
  const files = fs.readdirSync(paths.projectsDir).filter(f => f.endsWith('.json'))
  for (const f of files) {
    const config = JSON.parse(fs.readFileSync(path.join(paths.projectsDir, f), 'utf8'))
    if (config.projectPath && path.resolve(config.projectPath) === path.resolve(dir)) {
      return config
    }
  }
  return null
}

function getEnvironment (projectName, envName) {
  const project = typeof projectName === 'string' ? getProject(projectName) : projectName
  if (!project) return null
  return project.environments[envName] || null
}

function addEnvironment (projectName, envName, envConfig) {
  const project = getProject(projectName)
  if (!project) throw new Error(`Project "${projectName}" not found`)
  if (project.environments[envName]) {
    throw new Error(`Environment "${envName}" already exists in project "${projectName}"`)
  }
  project.environments[envName] = envConfig
  saveProject(projectName, project)
}

function updateEnvironment (projectName, envName, envConfig) {
  const project = getProject(projectName)
  if (!project) throw new Error(`Project "${projectName}" not found`)
  if (!project.environments[envName]) {
    throw new Error(`Environment "${envName}" not found in project "${projectName}"`)
  }
  project.environments[envName] = { ...project.environments[envName], ...envConfig }
  saveProject(projectName, project)
}

function removeEnvironment (projectName, envName) {
  const project = getProject(projectName)
  if (!project) throw new Error(`Project "${projectName}" not found`)
  if (!project.environments[envName]) {
    throw new Error(`Environment "${envName}" not found in project "${projectName}"`)
  }
  delete project.environments[envName]
  saveProject(projectName, project)
}

module.exports = {
  paths,
  ensureConfigDir,
  getProject,
  saveProject,
  listProjects,
  removeProject,
  getProjectFromCwd,
  getEnvironment,
  addEnvironment,
  updateEnvironment,
  removeEnvironment
}
