import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'module'

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
