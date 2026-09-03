import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const fs = require('fs')
const path = require('path')
const os = require('os')

const enquirer = require('enquirer')
const answers = {}
Object.defineProperty(enquirer, 'prompt', {
  configurable: true,
  value: async (question) => ({ [question.name]: answers[question.name] })
})

const store = require('../src/config/store')
const migrate = require('../commands/migrate')
const init = require('../commands/init')

let tmpDir, cwd, origProcyonDir, origProjectsDir, origCwd

describe('project collision warnings', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'procyon-collision-'))
    cwd = fs.realpathSync(tmpDir)
    origProcyonDir = store.paths.procyonDir
    origProjectsDir = store.paths.projectsDir
    store.paths.procyonDir = path.join(cwd, '.procyon')
    store.paths.projectsDir = path.join(cwd, '.procyon', 'projects')

    fs.writeFileSync(path.join(cwd, '.env'), 'SITE_NAME=new-name\nLOCAL_PATH=public\n')
    store.saveProject('old-name', {
      name: 'old-name',
      projectPath: cwd,
      localPath: path.join(cwd, 'public'),
      environments: {}
    })

    origCwd = process.cwd()
    process.chdir(cwd)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    Object.assign(answers, {
      confirm: true,
      projectName: 'new-name',
      localPath: path.join(cwd, 'public'),
      proceed: false,
      deleteEnv: false
    })
  })

  afterEach(() => {
    process.chdir(origCwd)
    vi.restoreAllMocks()
    store.paths.procyonDir = origProcyonDir
    store.paths.projectsDir = origProjectsDir
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('migrate does not write the project when the path collision is declined', async () => {
    await migrate.handler({ env: '.env' })
    expect(store.getProject('new-name')).toBeNull()
  })

  it('migrate warns but proceeds with -y', async () => {
    await migrate.handler({ env: '.env', y: true })
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('already linked to project "old-name"'))
    expect(store.getProject('new-name')).not.toBeNull()
  })

  it('init does not overwrite an existing project when the name collision is declined', async () => {
    const otherDir = path.join(cwd, 'other')
    fs.mkdirSync(otherDir)
    process.chdir(otherDir)
    Object.assign(answers, {
      projectName: 'old-name',
      localPath: otherDir,
      localDomain: '',
      wpCli: 'wp',
      addEnv: false
    })

    await init.handler({})

    expect(store.getProject('old-name').projectPath).toBe(cwd)
  })
})
