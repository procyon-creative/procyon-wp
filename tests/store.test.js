import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const fs = require('fs')
const path = require('path')
const os = require('os')
const store = require('../src/config/store')

let tmpDir, origProcyonDir, origProjectsDir

describe('config store', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'procyon-test-'))
    origProcyonDir = store.paths.procyonDir
    origProjectsDir = store.paths.projectsDir

    store.paths.procyonDir = tmpDir
    store.paths.projectsDir = path.join(tmpDir, 'projects')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    store.paths.procyonDir = origProcyonDir
    store.paths.projectsDir = origProjectsDir
  })

  const validConfig = {
    name: 'test-site',
    projectPath: '/Users/test/Sites/test-site',
    localPath: '/Users/test/Sites/test-site/public',
    environments: {
      staging: {
        host: 'staging.example.com',
        user: 'deploy',
        port: 22,
        path: '/var/www/html'
      }
    }
  }

  describe('saveProject / getProject', () => {
    it('saves and loads a project', () => {
      store.saveProject('test-site', validConfig)
      const loaded = store.getProject('test-site')
      expect(loaded).toEqual(validConfig)
    })

    it('returns null for non-existent project', () => {
      store.ensureConfigDir()
      expect(store.getProject('nope')).toBeNull()
    })

    it('throws on invalid config', () => {
      expect(() => store.saveProject('bad', { name: 'bad' }))
        .toThrow('Invalid config')
    })
  })

  describe('listProjects', () => {
    it('returns empty array when no projects', () => {
      expect(store.listProjects()).toEqual([])
    })

    it('lists saved projects', () => {
      store.saveProject('site-a', { ...validConfig, name: 'site-a' })
      store.saveProject('site-b', { ...validConfig, name: 'site-b' })
      const list = store.listProjects()
      expect(list).toHaveLength(2)
      expect(list.map(p => p.name).sort()).toEqual(['site-a', 'site-b'])
    })
  })

  describe('removeProject', () => {
    it('removes an existing project', () => {
      store.saveProject('test-site', validConfig)
      expect(store.removeProject('test-site')).toBe(true)
      expect(store.getProject('test-site')).toBeNull()
    })

    it('returns false for non-existent project', () => {
      store.ensureConfigDir()
      expect(store.removeProject('nope')).toBe(false)
    })
  })

  describe('getProjectFromCwd', () => {
    it('finds project by matching projectPath to cwd', () => {
      const projectDir = path.join(tmpDir, 'my-project')
      fs.mkdirSync(projectDir)
      const config = { ...validConfig, projectPath: projectDir }
      store.saveProject('test-site', config)

      const project = store.getProjectFromCwd(projectDir)
      expect(project).toEqual(config)
    })

    it('returns null when no project matches cwd', () => {
      store.ensureConfigDir()
      expect(store.getProjectFromCwd(tmpDir)).toBeNull()
    })
  })

  describe('getEnvironment', () => {
    it('returns environment from project config', () => {
      const env = store.getEnvironment(validConfig, 'staging')
      expect(env.host).toBe('staging.example.com')
      expect(env.user).toBe('deploy')
    })

    it('returns null for non-existent environment', () => {
      expect(store.getEnvironment(validConfig, 'production')).toBeNull()
    })
  })

  describe('addEnvironment', () => {
    it('adds a new environment to an existing project', () => {
      store.saveProject('test-site', validConfig)
      store.addEnvironment('test-site', 'live', {
        host: 'live.example.com',
        user: 'deploy',
        port: 22,
        path: '/var/www/html'
      })
      const project = store.getProject('test-site')
      expect(project.environments.live).toBeDefined()
      expect(project.environments.live.host).toBe('live.example.com')
      expect(project.environments.staging).toBeDefined()
    })

    it('throws if environment already exists', () => {
      store.saveProject('test-site', validConfig)
      expect(() => store.addEnvironment('test-site', 'staging', {
        host: 'x', user: 'x', path: '/x'
      })).toThrow('already exists')
    })

    it('throws if project not found', () => {
      store.ensureConfigDir()
      expect(() => store.addEnvironment('nope', 'live', {
        host: 'x', user: 'x', path: '/x'
      })).toThrow('not found')
    })
  })

  describe('updateEnvironment', () => {
    it('merges updates into an existing environment', () => {
      store.saveProject('test-site', validConfig)
      store.updateEnvironment('test-site', 'staging', { port: 2222, domain: 'staging.example.com' })
      const env = store.getProject('test-site').environments.staging
      expect(env.port).toBe(2222)
      expect(env.domain).toBe('staging.example.com')
      expect(env.host).toBe('staging.example.com')
      expect(env.user).toBe('deploy')
    })

    it('throws if environment does not exist', () => {
      store.saveProject('test-site', validConfig)
      expect(() => store.updateEnvironment('test-site', 'live', { port: 22 }))
        .toThrow('not found')
    })
  })

  describe('removeEnvironment', () => {
    it('removes an environment from a project', () => {
      const config = {
        ...validConfig,
        environments: {
          ...validConfig.environments,
          live: { host: 'live.example.com', user: 'deploy', port: 22, path: '/var/www/html' }
        }
      }
      store.saveProject('test-site', config)
      store.removeEnvironment('test-site', 'staging')
      const project = store.getProject('test-site')
      expect(project.environments.staging).toBeUndefined()
      expect(project.environments.live).toBeDefined()
    })

    it('throws if environment does not exist', () => {
      store.saveProject('test-site', validConfig)
      expect(() => store.removeEnvironment('test-site', 'nope'))
        .toThrow('not found')
    })
  })

})
