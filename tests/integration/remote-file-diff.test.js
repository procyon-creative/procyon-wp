import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'module'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const require = createRequire(import.meta.url)
const { RsyncTransfer } = require('../../src/sync/rsync')
const { displayContentDiffs } = require('../../src/sync/file-diff')

const runRemoteTests = process.env.PROCYON_REMOTE_TESTS === '1'
const remoteDescribe = runRemoteTests ? describe : describe.skip

remoteDescribe('file diff against a disposable SSH remote', () => {
  const container = `procyon-diff-test-${process.pid}`
  let directory
  let keyPath
  let rsync

  const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8' }).trim()

  beforeAll(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'procyon-remote-diff-'))
    keyPath = path.join(directory, 'id_ed25519')
    execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', keyPath])

    docker('run', '--detach', '--rm', '--name', container, '--publish', '127.0.0.1::22', 'alpine:3.22', 'sleep', 'infinity')
    docker('exec', container, 'apk', 'add', '--no-cache', 'openssh', 'rsync')
    docker('exec', container, 'ssh-keygen', '-A')
    docker('exec', container, 'mkdir', '-p', '/root/.ssh', '/remote/site/nested')
    execFileSync('docker', ['exec', '-i', container, 'sh', '-c', 'cat > /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys'], {
      input: fs.readFileSync(`${keyPath}.pub`)
    })
    docker('exec', container, 'sh', '-c', "printf 'same\\nremote line\\n' > /remote/site/file.txt")
    docker('exec', container, 'sh', '-c', "printf 'remote deep\\n' > /remote/site/nested/deep.txt")
    docker('exec', container, '/usr/sbin/sshd')

    const port = docker('port', container, '22/tcp').split(':').pop()
    const localRoot = path.join(directory, 'local')
    fs.mkdirSync(path.join(localRoot, 'site'), { recursive: true })
    fs.writeFileSync(path.join(localRoot, 'site/file.txt'), 'same\nlocal line\n')
    fs.mkdirSync(path.join(localRoot, 'site/nested'))
    fs.writeFileSync(path.join(localRoot, 'site/nested/deep.txt'), 'local deep\n')

    rsync = new RsyncTransfer({ localPath: localRoot }, {
      host: '127.0.0.1',
      user: 'root',
      port: Number(port),
      identityFile: keyPath,
      path: '/remote'
    })
    rsync.buildSshCommand = () => [
      'ssh',
      '-p', port,
      '-i', keyPath,
      '-o', 'BatchMode=yes',
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null'
    ].join(' ')
  }, 60000)

  afterAll(() => {
    vi.restoreAllMocks()
    try {
      docker('rm', '--force', container)
    } catch {}
    if (directory) fs.rmSync(directory, { recursive: true, force: true })
  })

  it('renders real push and pull patches without changing either endpoint', async () => {
    const localPath = rsync.buildLocal('site/file.txt')
    const deepLocalPath = rsync.buildLocal('site/nested/deep.txt')
    const localBefore = fs.readFileSync(localPath, 'utf8')
    const deepLocalBefore = fs.readFileSync(deepLocalPath, 'utf8')
    const remoteBefore = docker('exec', container, 'cat', '/remote/site/file.txt')
    const deepRemoteBefore = docker('exec', container, 'cat', '/remote/site/nested/deep.txt')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    const pushChanges = await rsync.dryRun('site', 'site')
    expect(pushChanges.modified).toEqual(['file.txt', 'nested/deep.txt'])
    await displayContentDiffs(rsync, 'site', pushChanges, 'push')
    const pushOutput = log.mock.calls.flat().join('\n')
    expect(pushOutput).toContain('--- remote/file.txt')
    expect(pushOutput).toContain('+++ local/file.txt')
    expect(pushOutput).toContain('-remote line')
    expect(pushOutput).toContain('+local line')

    log.mockClear()
    const pullChanges = await rsync.dryRun('site', 'site', { direction: 'pull' })
    expect(pullChanges.modified).toEqual(['file.txt', 'nested/deep.txt'])
    await displayContentDiffs(rsync, 'site', pullChanges, 'pull')
    const pullOutput = log.mock.calls.flat().join('\n')
    expect(pullOutput).toContain('--- local/file.txt')
    expect(pullOutput).toContain('+++ remote/file.txt')
    expect(pullOutput).toContain('-local line')
    expect(pullOutput).toContain('+remote line')

    expect(fs.readFileSync(localPath, 'utf8')).toBe(localBefore)
    expect(fs.readFileSync(deepLocalPath, 'utf8')).toBe(deepLocalBefore)
    expect(docker('exec', container, 'cat', '/remote/site/file.txt')).toBe(remoteBefore)
    expect(docker('exec', container, 'cat', '/remote/site/nested/deep.txt')).toBe(deepRemoteBefore)
  }, 30000)

  it('limits traversal depth in the real remote file list', async () => {
    const unlimited = await rsync.dryRun('site', 'site')
    expect(unlimited.modified).toEqual(['file.txt', 'nested/deep.txt'])

    const rootOnly = await rsync.dryRun('site', 'site', { maxDepth: 0 })
    expect(rootOnly.modified).toEqual(['file.txt'])
  })
})
