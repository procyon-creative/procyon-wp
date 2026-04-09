const { spawn } = require('child_process')
const os = require('os')
const path = require('path')
const fs = require('fs')
const { lookupSshHost } = require('../ssh-config')

const DEFAULT_EXCLUDE_FILE = path.join(__dirname, '../../bin/rsync-exclude')

class ConnectionError extends Error {
  constructor (code) {
    super(`Connection failed (rsync exited with code ${code})`)
    this.name = 'ConnectionError'
    this.exitCode = code
  }
}

function rsyncError (code) {
  if (code === 255) return new ConnectionError(code)
  return new Error(`rsync exited with code ${code}`)
}

class RsyncTransfer {
  constructor (project, environment) {
    this.project = project
    this.env = environment
  }

  /**
   * Check if the host has an SSH config alias, meaning SSH will
   * handle user/port/key resolution on its own.
   */
  hasSshAlias () {
    if (this._hasSshAlias === undefined) {
      this._hasSshAlias = !!lookupSshHost(this.env.host)
    }
    return this._hasSshAlias
  }

  buildSshCommand () {
    // If SSH config has this host, let it handle port/key
    if (this.hasSshAlias()) {
      return 'ssh'
    }
    const { port, identityFile } = this.env
    let ssh = `ssh -p ${port || 22}`
    if (identityFile) {
      const keyPath = identityFile.replace('~', os.homedir())
      ssh += ` -i "${keyPath}"`
    }
    return ssh
  }

  buildRemote (subpath) {
    const { host, path: remotePath } = this.env
    const full = subpath ? `${remotePath}/${subpath}` : remotePath
    // If SSH config defines the user, let it handle it
    if (this.hasSshAlias()) {
      return `${host}:${full}`
    }
    return `${this.env.user}@${host}:${full}`
  }

  buildLocal (subpath) {
    return subpath
      ? path.join(this.project.localPath, subpath)
      : this.project.localPath
  }

  /**
   * Build local and remote paths, detecting files vs directories.
   * Directories get trailing slashes (rsync "contents of" semantics);
   * files do not.
   */
  buildPaths (localSub, remoteSub) {
    const localRaw = this.buildLocal(localSub)
    const isFile = isFilePath(localRaw)
    return {
      local: isFile ? localRaw : ensureTrailingSlash(localRaw),
      remote: isFile ? this.buildRemote(remoteSub) : ensureTrailingSlash(this.buildRemote(remoteSub)),
      isFile
    }
  }

  buildExcludeArgs () {
    const excludeFile = this.project.excludeFile || DEFAULT_EXCLUDE_FILE
    if (fs.existsSync(excludeFile)) {
      return ['--exclude-from', excludeFile]
    }
    // Fall back to inline excludes from project config
    const excludes = this.project.exclude || []
    return excludes.flatMap(pattern => ['--exclude', pattern])
  }

  /**
   * Pull files from remote to local
   */
  async pull (remoteSub, localSub, options = {}) {
    const excludeArgs = options.noDefaultExclude
      ? (options.excludeArgs || [])
      : this.buildExcludeArgs()

    const args = [
      '-chavzP',
      '--stats',
      '-e', this.buildSshCommand(),
      ...excludeArgs
    ]

    if (options.dryRun) args.push('--dry-run', '--itemize-changes')
    if (options.delete) args.push('--delete-after')

    const { local, remote, isFile } = this.buildPaths(localSub, remoteSub)

    // Ensure local parent directory (file) or target directory exists
    fs.mkdirSync(isFile ? path.dirname(local) : local.replace(/\/$/, ''), { recursive: true })

    args.push(remote, local)

    return this.exec(args, options)
  }

  /**
   * Push files from local to remote
   */
  async push (localSub, remoteSub, options = {}) {
    const excludeArgs = options.noDefaultExclude
      ? (options.excludeArgs || [])
      : this.buildExcludeArgs()

    const args = [
      '-chavzP',
      '--stats',
      '-e', this.buildSshCommand(),
      ...excludeArgs
    ]

    if (options.dryRun) args.push('--dry-run', '--itemize-changes')
    if (options.delete) args.push('--delete-after')

    const { local, remote } = this.buildPaths(localSub, remoteSub)

    args.push(local, remote)

    return this.exec(args, options)
  }

  /**
   * Run rsync with --dry-run --itemize-changes and parse the output.
   * Direction is local→remote (push preview) by default.
   * Set options.direction = 'pull' for remote→local.
   * Set options.noDefaultExclude = true to skip the default exclude file.
   * Set options.excludeArgs = [...] to use custom exclude args.
   */
  async dryRun (localSub, remoteSub, options = {}) {
    const excludeArgs = options.noDefaultExclude
      ? (options.excludeArgs || [])
      : this.buildExcludeArgs()

    const args = [
      '-chavzP',
      '--dry-run',
      '--itemize-changes',
      '-e', this.buildSshCommand(),
      ...excludeArgs
    ]

    if (options.delete) args.push('--delete-after')

    const { local, remote } = this.buildPaths(localSub, remoteSub)

    if (options.direction === 'pull') {
      args.push(remote, local)
    } else {
      args.push(local, remote)
    }

    return new Promise((resolve, reject) => {
      const child = spawn('rsync', args, { stdio: ['inherit', 'pipe', 'inherit'] })
      let output = ''

      child.stdout.on('data', (data) => {
        output += data.toString()
      })

      child.on('close', (code) => {
        if (code !== 0) {
          reject(rsyncError(code))
          return
        }
        resolve(parseItemizedChanges(output))
      })

      child.on('error', reject)
    })
  }

  /**
   * Run an SSH command on the remote
   */
  async ssh (command, options = {}) {
    const { user, host, port, identityFile } = this.env
    const args = []
    if (this.hasSshAlias()) {
      args.push(host, command)
    } else {
      args.push('-p', String(port || 22))
      if (identityFile) {
        args.push('-i', identityFile.replace('~', os.homedir()))
      }
      args.push(`${user}@${host}`, command)
    }

    return new Promise((resolve, reject) => {
      const capture = options.capture
      const child = spawn('ssh', args, { stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit' })
      let stdout = ''

      if (capture && child.stdout) {
        child.stdout.on('data', (data) => { stdout += data.toString() })
      }

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`SSH command exited with code ${code}`))
          return
        }
        resolve(capture ? stdout : undefined)
      })
      child.on('error', reject)
    })
  }

  exec (args, options = {}) {
    return new Promise((resolve, reject) => {
      const stdio = options.capture ? ['inherit', 'pipe', 'inherit'] : 'inherit'
      const child = spawn('rsync', args, { stdio })
      let output = ''

      if (options.capture && child.stdout) {
        child.stdout.on('data', (data) => {
          output += data.toString()
        })
      }

      child.on('close', (code) => {
        if (code !== 0) {
          reject(rsyncError(code))
          return
        }
        resolve(options.capture ? output : undefined)
      })

      child.on('error', reject)
    })
  }
}

function shellQuote (s) {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

function ensureTrailingSlash (p) {
  return p.endsWith('/') ? p : p + '/'
}

/**
 * Check whether a local path points to a file (not a directory).
 * Checks the filesystem first; falls back to checking if the basename
 * contains a dot (e.g. "style.css") when the path doesn't exist yet.
 */
function isFilePath (localPath) {
  const clean = localPath.replace(/\/$/, '')
  try {
    return fs.statSync(clean).isFile()
  } catch {
    // Path doesn't exist — use heuristic: files have extensions
    return path.extname(path.basename(clean)) !== ''
  }
}

/**
 * Parse rsync --itemize-changes output into structured changes
 */
/**
 * Parse rsync --itemize-changes output into structured changes.
 *
 * Rsync itemize format: YXcstpoguax  path/to/file
 *   Y = update type: < sent, > received, c local change, h hard link, . unchanged
 *   X = file type: f file, d directory, L symlink, etc.
 *   +++ = new item
 */
function parseItemizedChanges (output) {
  const added = []
  const modified = []
  const deleted = []

  for (const line of output.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('sent') || trimmed.startsWith('total')) continue

    if (trimmed.startsWith('*deleting')) {
      deleted.push(trimmed.replace('*deleting   ', ''))
    } else if (/^[<>c]f\+{9}/.test(trimmed)) {
      // New file (sent, received, or local)
      added.push(trimmed.substring(12).trim())
    } else if (/^[<>c]f/.test(trimmed)) {
      // Modified file
      modified.push(trimmed.substring(12).trim())
    } else if (/^[<>c.]d\+{9}/.test(trimmed)) {
      // New directory
      added.push(trimmed.substring(12).trim())
    }
  }

  return { added, modified, deleted }
}

/**
 * Print a human-readable diff summary.
 * direction: 'push' (local overwrites remote) or 'pull' (remote overwrites local)
 */
function displayDiff (changes, direction = 'push') {
  const arrow = direction === 'push' ? '⬆️' : '⬇️'
  const target = direction === 'push' ? 'remote' : 'local'

  if (changes.added.length === 0 && changes.modified.length === 0 && changes.deleted.length === 0) {
    console.log('No changes.')
    return false
  }

  console.log()
  if (changes.added.length > 0) {
    console.log(`  ${arrow}  New files (will be added to ${target}):`)
    for (const f of changes.added) console.log(`       + ${f}`)
  }
  if (changes.modified.length > 0) {
    console.log(`  ${arrow}  Modified files (will overwrite ${target}):`)
    for (const f of changes.modified) console.log(`       ✏️  ${f}`)
  }
  if (changes.deleted.length > 0) {
    console.log(`  🗑️  Deleted files (will be removed from ${target}):`)
    for (const f of changes.deleted) console.log(`       - ${f}`)
  }

  console.log(`\n  ${changes.added.length} added, ${changes.modified.length} modified, ${changes.deleted.length} deleted`)
  return true
}

module.exports = { RsyncTransfer, ConnectionError, parseItemizedChanges, displayDiff, shellQuote }
