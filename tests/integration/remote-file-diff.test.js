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
    docker('exec', container, 'mkdir', '-p', '/root/.ssh', '/remote/site/nested', '/remote/cases')
    execFileSync('docker', ['exec', '-i', container, 'sh', '-c', 'cat > /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys'], {
      input: fs.readFileSync(`${keyPath}.pub`)
    })
    docker('exec', container, 'sh', '-c', "printf 'same\\nremote line\\n' > /remote/site/file.txt")
    docker('exec', container, 'sh', '-c', "printf 'remote deep\\n' > /remote/site/nested/deep.txt")
    docker('exec', container, 'sh', '-c', "printf 'remote only\\n' > /remote/cases/remote-only.txt")
    docker('exec', container, 'sh', '-c', "printf 'same\\n' > /remote/cases/unchanged.txt")
    docker('exec', container, 'sh', '-c', "printf 'remote ignored\\n' > /remote/cases/ignored.txt")
    execFileSync('docker', ['exec', '-i', container, 'sh', '-c', 'cat > /remote/cases/binary.dat'], {
      input: Buffer.from([1, 0, 2])
    })
    docker('exec', container, 'sh', '-c', 'head -c 1048577 /dev/zero | tr "\\0" a > /remote/cases/large.txt')
    docker('exec', container, '/usr/sbin/sshd')

    const port = docker('port', container, '22/tcp').split(':').pop()
    const localRoot = path.join(directory, 'local')
    fs.mkdirSync(path.join(localRoot, 'site'), { recursive: true })
    fs.writeFileSync(path.join(localRoot, 'site/file.txt'), 'same\nlocal line\n')
    fs.mkdirSync(path.join(localRoot, 'site/nested'))
    fs.writeFileSync(path.join(localRoot, 'site/nested/deep.txt'), 'local deep\n')
    fs.mkdirSync(path.join(localRoot, 'cases'))
    fs.writeFileSync(path.join(localRoot, 'cases/local-only.txt'), 'local only\n')
    fs.writeFileSync(path.join(localRoot, 'cases/unchanged.txt'), 'same\n')
    fs.writeFileSync(path.join(localRoot, 'cases/ignored.txt'), 'local ignored\n')
    fs.writeFileSync(path.join(localRoot, 'cases/binary.dat'), Buffer.from([1, 0, 3]))
    fs.writeFileSync(path.join(localRoot, 'cases/large.txt'), 'b'.repeat(1048577))

    rsync = new RsyncTransfer({
      localPath: localRoot,
      excludeFile: path.join(directory, 'missing-excludes'),
      exclude: ['ignored.txt']
    }, {
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

  it('classifies added, deleted, unchanged, binary, large, and excluded files', async () => {
    const localBinaryBefore = fs.readFileSync(rsync.buildLocal('cases/binary.dat'))
    const remoteBinaryBefore = docker('exec', container, 'sha256sum', '/remote/cases/binary.dat')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    const pushChanges = await rsync.dryRun('cases', 'cases', { delete: true })
    expect(pushChanges.added).toContain('local-only.txt')
    expect(pushChanges.deleted).toContain('remote-only.txt')
    expect(pushChanges.contentModified).toEqual(expect.arrayContaining(['binary.dat', 'large.txt']))
    expect([...pushChanges.added, ...pushChanges.modified, ...pushChanges.deleted]).not.toContain('unchanged.txt')
    expect([...pushChanges.added, ...pushChanges.modified, ...pushChanges.deleted]).not.toContain('ignored.txt')

    await displayContentDiffs(rsync, 'cases', pushChanges, 'push')
    const output = log.mock.calls.flat().join('\n')
    expect(output).toContain('Binary files differ; content diff is not displayed.')
    expect(output).toContain('Binary/content diff skipped (file exceeds 1048576 bytes).')

    const pullChanges = await rsync.dryRun('cases', 'cases', { direction: 'pull', delete: true })
    expect(pullChanges.added).toContain('remote-only.txt')
    expect(pullChanges.deleted).toContain('local-only.txt')

    expect(fs.readFileSync(rsync.buildLocal('cases/binary.dat'))).toEqual(localBinaryBefore)
    expect(docker('exec', container, 'sha256sum', '/remote/cases/binary.dat')).toBe(remoteBinaryBefore)
  })
})
