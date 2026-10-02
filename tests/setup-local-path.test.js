import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const fs = require('fs')
const path = require('path')
const os = require('os')

const enquirer = require('enquirer')
let asked = []

// Confirms the import, declines extra environments and .env deletion, and
// answers every other prompt with its pre-filled value (or first choice).
const ANSWERS = { confirm: true, addEnv: false, deleteEnv: false }
Object.defineProperty(enquirer, 'prompt', {
  configurable: true,
  value: async (questions) => {
    const list = Array.isArray(questions) ? questions : [questions]
    asked.push(...list)
    return Object.fromEntries(list.map(q => [
      q.name,
      q.name in ANSWERS ? ANSWERS[q.name] : (q.initial ?? (q.choices && q.choices[0]))
    ]))
  }
})

const store = require('../src/config/store')
const init = require('../commands/init')
const migrate = require('../commands/migrate')

let tmpDir, projectDir, origCwd, origProcyonDir, origProjectsDir

function writeProjectFile (name, contents) {
  fs.writeFileSync(path.join(projectDir, name), contents)
}

function initialFor (field) {
  return asked.find(q => q.name === field).initial
}

function savedLocalPath () {
  return store.getProject(path.basename(projectDir)).localPath
}

describe('setup default local path', () => {
  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'procyon-local-path-')))
    projectDir = path.join(tmpDir, 'site')
    fs.mkdirSync(projectDir)
    origCwd = process.cwd()
    process.chdir(projectDir)
    origProcyonDir = store.paths.procyonDir
    origProjectsDir = store.paths.projectsDir
    store.paths.procyonDir = path.join(tmpDir, '.procyon')
    store.paths.projectsDir = path.join(tmpDir, '.procyon', 'projects')
    asked = []
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.chdir(origCwd)
    store.paths.procyonDir = origProcyonDir
    store.paths.projectsDir = origProjectsDir
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('init', () => {
    it('pre-fills the Lando webroot', async () => {
      writeProjectFile('.lando.yml', 'config:\n  webroot: public\n')

      await init.handler({})

      expect(initialFor('localPath')).toBe(path.join(projectDir, 'public'))
      expect(savedLocalPath()).toBe(path.join(projectDir, 'public'))
    })

    it('pre-fills the current directory without .lando.yml', async () => {
      await init.handler({})

      expect(initialFor('localPath')).toBe(projectDir)
    })
  })

  describe('migrate', () => {
    it('pre-fills the Lando webroot when .env has no LOCAL_PATH', async () => {
      writeProjectFile('.lando.yml', 'config:\n  webroot: public\n')
      writeProjectFile('.env', 'SITE_NAME=site\n')

      await migrate.handler({ env: '.env' })

      expect(initialFor('localPath')).toBe(path.join(projectDir, 'public'))
    })

    it('saves the Lando webroot with -y', async () => {
      writeProjectFile('.lando.yml', 'config:\n  webroot: public\n')
      writeProjectFile('.env', 'SITE_NAME=site\n')

      await migrate.handler({ env: '.env', y: true })

      expect(savedLocalPath()).toBe(path.join(projectDir, 'public'))
    })

    it('keeps LOCAL_PATH from .env over the Lando webroot', async () => {
      writeProjectFile('.lando.yml', 'config:\n  webroot: public\n')
      writeProjectFile('.env', 'SITE_NAME=site\nLOCAL_PATH=/srv/wordpress\n')

      await migrate.handler({ env: '.env', y: true })

      expect(savedLocalPath()).toBe('/srv/wordpress')
    })
  })
})
