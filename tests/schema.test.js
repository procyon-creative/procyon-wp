import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { validateProject } = require('../src/config/schema')

describe('validateProject', () => {
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

  it('accepts a valid project config', () => {
    const result = validateProject(validConfig)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects missing name', () => {
    const result = validateProject({ ...validConfig, name: '' })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Missing required field: name')
  })

  it('rejects missing localPath', () => {
    const result = validateProject({ ...validConfig, localPath: undefined })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Missing required field: localPath')
  })

  it('rejects missing projectPath', () => {
    const result = validateProject({ name: 'test', localPath: '/tmp', environments: {} })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Missing required field: projectPath')
  })

  it('rejects missing environments', () => {
    const result = validateProject({ name: 'test', projectPath: '/tmp', localPath: '/tmp' })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Missing required field: environments')
  })

  it('rejects environment missing host', () => {
    const config = {
      name: 'test',
      projectPath: '/tmp',
      localPath: '/tmp',
      environments: {
        staging: { user: 'deploy', path: '/var/www' }
      }
    }
    const result = validateProject(config)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Environment "staging" missing required field: host')
  })

  it('rejects environment missing user', () => {
    const config = {
      name: 'test',
      projectPath: '/tmp',
      localPath: '/tmp',
      environments: {
        live: { host: 'example.com', path: '/var/www' }
      }
    }
    const result = validateProject(config)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Environment "live" missing required field: user')
  })

  it('rejects environment missing path', () => {
    const config = {
      name: 'test',
      projectPath: '/tmp',
      localPath: '/tmp',
      environments: {
        staging: { host: 'example.com', user: 'deploy' }
      }
    }
    const result = validateProject(config)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Environment "staging" missing required field: path')
  })

  it('collects multiple errors', () => {
    const result = validateProject({})
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThanOrEqual(3)
  })

  it('rejects null config', () => {
    const result = validateProject(null)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Config must be an object')
  })

  it('rejects non-object environments', () => {
    const result = validateProject({ name: 'test', projectPath: '/tmp', localPath: '/tmp', environments: 'abc' })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('environments must be an object')
  })

  it('rejects array environments', () => {
    const result = validateProject({ name: 'test', projectPath: '/tmp', localPath: '/tmp', environments: [] })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('environments must be an object')
  })
})
