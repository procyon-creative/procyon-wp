import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'
import os from 'os'

const require = createRequire(import.meta.url)
const { lookupSshHost } = require('../src/ssh-config')

const fixtureConfig = `
Host example-site example-site.wpenginepowered.com
  Hostname example-site.ssh.wpengine.net
  User example-site
  StrictHostKeyChecking no
  IdentityFile ~/.ssh/id_rsa
  IdentitiesOnly yes

Host example-staging example-staging.wpenginepowered.com
  Hostname example-staging.ssh.wpengine.net
  User example-staging
  IdentityFile ~/.ssh/id_rsa

Host myserver
  Hostname myserver.example.com
  User deploy
  Port 2222

Host nohost
  User justuser

Host *
  User default
  ServerAliveInterval 60
`

describe('lookupSshHost', () => {
  let tmpDir, configPath

  // Write a temp SSH config file for testing
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'procyon-ssh-test-'))
  configPath = path.join(tmpDir, 'config')
  fs.writeFileSync(configPath, fixtureConfig)

  it('resolves a WPE host alias', () => {
    const result = lookupSshHost('example-site', configPath)
    expect(result).not.toBeNull()
    expect(result.hostname).toBe('example-site.ssh.wpengine.net')
    expect(result.user).toBe('example-site')
    expect(result.identityFile).toBe('~/.ssh/id_rsa')
  })

  it('resolves the second alias for the same host', () => {
    const result = lookupSshHost('example-site.wpenginepowered.com', configPath)
    expect(result).not.toBeNull()
    expect(result.user).toBe('example-site')
  })

  it('resolves staging host', () => {
    const result = lookupSshHost('example-staging', configPath)
    expect(result).not.toBeNull()
    expect(result.hostname).toBe('example-staging.ssh.wpengine.net')
    expect(result.user).toBe('example-staging')
  })

  it('resolves host with custom port', () => {
    const result = lookupSshHost('myserver', configPath)
    expect(result).not.toBeNull()
    expect(result.hostname).toBe('myserver.example.com')
    expect(result.user).toBe('deploy')
    expect(result.port).toBe(2222)
  })

  it('returns null for host without Hostname defined', () => {
    const result = lookupSshHost('nohost', configPath)
    expect(result).toBeNull()
  })

  it('returns null for unknown host', () => {
    const result = lookupSshHost('nonexistent', configPath)
    expect(result).toBeNull()
  })

  it('returns null when config file does not exist', () => {
    const result = lookupSshHost('anything', '/nonexistent/path/config')
    expect(result).toBeNull()
  })
})
