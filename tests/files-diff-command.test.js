import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const require = createRequire(import.meta.url)
const { RsyncTransfer } = require('../src/sync/rsync')
const pullCommand = require('../commands/files/pull')
const pushCommand = require('../commands/files/push')

const project = {
  localPath: '/tmp/procyon-project',
  environments: {
    staging: {
      host: 'staging.example.com',
      path: '/var/www/html',
      user: 'deploy'
    }
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('files --diff read-only command behavior', () => {
  it.each([
    ['pull', pullCommand],
    ['push', pushCommand]
  ])('rejects a %s path outside localPath before remote analysis', async (_name, command) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'procyon-command-path-'))
    const localPath = path.join(root, 'local')
    fs.mkdirSync(localPath)
    fs.mkdirSync(path.join(root, 'outside'))
    const dryRun = vi.spyOn(RsyncTransfer.prototype, 'dryRun').mockResolvedValue({
      added: [],
      modified: [],
      deleted: []
    })

    try {
      await expect(command.handler({
        project: { ...project, localPath },
        target: 'staging',
        path: '../outside',
        diff: true,
        dryRun: false
      })).rejects.toThrow('--path must stay within localPath')
      expect(dryRun).not.toHaveBeenCalled()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it.each([
    ['pull', pullCommand],
    ['push', pushCommand]
  ])('reports %s analysis failures to the caller', async (_name, command) => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(RsyncTransfer.prototype, 'dryRun').mockRejectedValue(new Error('analysis failed'))

    await expect(command.handler({
      project,
      target: 'staging',
      item: 'themes',
      diff: true,
      dryRun: false,
      y: false,
      noBackup: false
    })).rejects.toThrow('analysis failed')
  })

  it('does not invoke a pull transfer', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(RsyncTransfer.prototype, 'dryRun').mockResolvedValue({
      added: [],
      modified: [],
      deleted: []
    })
    const pull = vi.spyOn(RsyncTransfer.prototype, 'pull').mockResolvedValue()

    await pullCommand.handler({
      project,
      target: 'staging',
      item: 'themes',
      diff: true,
      dryRun: false
    })

    expect(pull).not.toHaveBeenCalled()
  })

  it('does not invoke a push transfer, backup, or prompt path', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(RsyncTransfer.prototype, 'dryRun').mockResolvedValue({
      added: [],
      modified: [],
      deleted: []
    })
    const push = vi.spyOn(RsyncTransfer.prototype, 'push').mockResolvedValue()

    await pushCommand.handler({
      project,
      target: 'staging',
      item: 'themes',
      diff: true,
      dryRun: false,
      y: false,
      noBackup: false
    })

    expect(push).not.toHaveBeenCalled()
  })
})
