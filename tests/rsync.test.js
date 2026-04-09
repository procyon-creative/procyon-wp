import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { RsyncTransfer, parseItemizedChanges, shellQuote } = require('../src/sync/rsync')

const mockProject = {
  name: 'test-site',
  localPath: '/Users/test/Sites/test-site',
  environments: {
    staging: {
      host: 'staging.example.com',
      user: 'deploy',
      port: 22,
      path: '/var/www/html'
    }
  }
}

const mockEnv = mockProject.environments.staging

describe('RsyncTransfer', () => {
  describe('buildSshCommand', () => {
    it('builds basic SSH command with port', () => {
      const rsync = new RsyncTransfer(mockProject, mockEnv)
      expect(rsync.buildSshCommand()).toBe('ssh -p 22')
    })

    it('includes custom port', () => {
      const rsync = new RsyncTransfer(mockProject, { ...mockEnv, port: 2222 })
      expect(rsync.buildSshCommand()).toBe('ssh -p 2222')
    })

    it('includes identity file', () => {
      const rsync = new RsyncTransfer(mockProject, {
        ...mockEnv,
        identityFile: '/home/user/.ssh/id_rsa'
      })
      expect(rsync.buildSshCommand()).toBe('ssh -p 22 -i "/home/user/.ssh/id_rsa"')
    })

    it('expands tilde in identity file', () => {
      const os = require('os')
      const rsync = new RsyncTransfer(mockProject, {
        ...mockEnv,
        identityFile: '~/.ssh/id_rsa'
      })
      expect(rsync.buildSshCommand()).toBe(`ssh -p 22 -i "${os.homedir()}/.ssh/id_rsa"`)
    })
  })

  describe('buildRemote', () => {
    it('builds remote path with subpath', () => {
      const rsync = new RsyncTransfer(mockProject, mockEnv)
      expect(rsync.buildRemote('wp-content/themes'))
        .toBe('deploy@staging.example.com:/var/www/html/wp-content/themes')
    })

    it('builds remote path without subpath', () => {
      const rsync = new RsyncTransfer(mockProject, mockEnv)
      expect(rsync.buildRemote())
        .toBe('deploy@staging.example.com:/var/www/html')
    })
  })

  describe('buildLocal', () => {
    it('builds local path with subpath', () => {
      const rsync = new RsyncTransfer(mockProject, mockEnv)
      expect(rsync.buildLocal('wp-content/themes'))
        .toBe('/Users/test/Sites/test-site/wp-content/themes')
    })

    it('builds local path without subpath', () => {
      const rsync = new RsyncTransfer(mockProject, mockEnv)
      expect(rsync.buildLocal())
        .toBe('/Users/test/Sites/test-site')
    })
  })

  describe('buildExcludeArgs', () => {
    it('uses project exclude array when no exclude file', () => {
      const project = {
        ...mockProject,
        excludeFile: '/nonexistent/file',
        exclude: ['*.zip', 'node_modules/']
      }
      const rsync = new RsyncTransfer(project, mockEnv)
      expect(rsync.buildExcludeArgs()).toEqual([
        '--exclude', '*.zip',
        '--exclude', 'node_modules/'
      ])
    })

    it('returns empty array when no excludes configured and file missing', () => {
      const project = { ...mockProject, excludeFile: '/nonexistent/file' }
      const rsync = new RsyncTransfer(project, mockEnv)
      expect(rsync.buildExcludeArgs()).toEqual([])
    })

    it('uses default rsync-exclude file when it exists and no excludeFile set', () => {
      const rsync = new RsyncTransfer(mockProject, mockEnv)
      const args = rsync.buildExcludeArgs()
      expect(args[0]).toBe('--exclude-from')
      expect(args[1]).toMatch(/bin\/rsync-exclude$/)
    })

    it('uses custom excludeFile when it exists', () => {
      const os = require('os')
      const fs = require('fs')
      const path = require('path')
      // Use a real temp file
      const tmpFile = path.join(os.tmpdir(), 'procyon-test-exclude')
      fs.writeFileSync(tmpFile, '*.log\n')
      try {
        const project = { ...mockProject, excludeFile: tmpFile }
        const rsync = new RsyncTransfer(project, mockEnv)
        expect(rsync.buildExcludeArgs()).toEqual(['--exclude-from', tmpFile])
      } finally {
        fs.unlinkSync(tmpFile)
      }
    })
  })
})

describe('parseItemizedChanges', () => {
  it('parses new files', () => {
    const output = '>f+++++++++ new-file.txt\n>f+++++++++ another.js\n'
    const result = parseItemizedChanges(output)
    expect(result.added).toEqual(['new-file.txt', 'another.js'])
    expect(result.modified).toEqual([])
    expect(result.deleted).toEqual([])
  })

  it('parses modified files', () => {
    const output = '>f.st...... changed.txt\n>f..t...... updated.js\n'
    const result = parseItemizedChanges(output)
    expect(result.modified).toEqual(['changed.txt', 'updated.js'])
    expect(result.added).toEqual([])
  })

  it('parses deleted files', () => {
    const output = '*deleting   old-file.txt\n*deleting   removed.js\n'
    const result = parseItemizedChanges(output)
    expect(result.deleted).toEqual(['old-file.txt', 'removed.js'])
  })

  it('parses new directories', () => {
    const output = 'cd+++++++++ new-dir/\n'
    const result = parseItemizedChanges(output)
    expect(result.added).toEqual(['new-dir/'])
  })

  it('parses mixed output', () => {
    const output = [
      '>f+++++++++ new.txt',
      '>f.st...... changed.txt',
      '*deleting   old.txt',
      'cd+++++++++ new-dir/',
      'sent 1234 bytes  received 56 bytes',
      'total size is 5678  speedup is 1.23',
      ''
    ].join('\n')

    const result = parseItemizedChanges(output)
    expect(result.added).toEqual(['new.txt', 'new-dir/'])
    expect(result.modified).toEqual(['changed.txt'])
    expect(result.deleted).toEqual(['old.txt'])
  })

  it('parses push direction (< prefix)', () => {
    const output = [
      '<f+++++++++ new-theme.css',
      '<f.st...... functions.php',
      'cd+++++++++ assets/fonts/'
    ].join('\n')

    const result = parseItemizedChanges(output)
    expect(result.added).toEqual(['new-theme.css', 'assets/fonts/'])
    expect(result.modified).toEqual(['functions.php'])
  })

  it('handles empty output', () => {
    const result = parseItemizedChanges('')
    expect(result.added).toEqual([])
    expect(result.modified).toEqual([])
    expect(result.deleted).toEqual([])
  })
})

describe('shellQuote', () => {
  it('quotes a simple string', () => {
    expect(shellQuote('/var/www/html')).toBe("'/var/www/html'")
  })

  it('escapes single quotes', () => {
    expect(shellQuote("it's")).toBe("'it'\\''s'")
  })

  it('handles paths with spaces', () => {
    expect(shellQuote('/my path/to dir')).toBe("'/my path/to dir'")
  })
})
