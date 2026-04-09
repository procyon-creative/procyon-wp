import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const fs = require('fs')
const path = require('path')
const os = require('os')
const { listBackups, getBackupPath } = require('../src/sync/backup')
const store = require('../src/config/store')

let tmpDir, origProcyonDir, origProjectsDir

describe('backup', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'procyon-backup-test-'))
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

  describe('listBackups', () => {
    it('returns empty array when no backups exist', () => {
      expect(listBackups('my-site', 'staging', 'themes')).toEqual([])
    })

    it('lists backups sorted newest first', () => {
      const backupDir = path.join(tmpDir, 'backups', 'my-site', 'staging', 'themes')
      fs.mkdirSync(path.join(backupDir, '2024-01-10T10-00-00'), { recursive: true })
      fs.mkdirSync(path.join(backupDir, '2024-01-15T10-00-00'), { recursive: true })
      fs.mkdirSync(path.join(backupDir, '2024-01-12T10-00-00'), { recursive: true })

      const backups = listBackups('my-site', 'staging', 'themes')
      expect(backups).toEqual([
        '2024-01-15T10-00-00',
        '2024-01-12T10-00-00',
        '2024-01-10T10-00-00'
      ])
    })
  })

  describe('getBackupPath', () => {
    it('returns path for existing backup', () => {
      const backupDir = path.join(tmpDir, 'backups', 'my-site', 'staging', 'themes', '2024-01-15T10-00-00')
      fs.mkdirSync(backupDir, { recursive: true })

      const result = getBackupPath('my-site', 'staging', 'themes', '2024-01-15T10-00-00')
      expect(result).toBe(backupDir)
    })

    it('returns null for non-existent backup', () => {
      const result = getBackupPath('my-site', 'staging', 'themes', '2024-99-99T00-00-00')
      expect(result).toBeNull()
    })
  })
})
