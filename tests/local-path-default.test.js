import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const fs = require('fs')
const path = require('path')
const os = require('os')

const { LocalPathDefault } = require('../src/config/local-path-default')

describe('LocalPathDefault', () => {
  let dir

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'procyon-local-path-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  function writeLando (contents) {
    fs.writeFileSync(path.join(dir, '.lando.yml'), contents)
  }

  it('uses the project directory when there is no .lando.yml', () => {
    expect(new LocalPathDefault(dir).resolve()).toBe(dir)
  })

  it('uses the Lando webroot when .lando.yml sets one', () => {
    writeLando('name: site\nconfig:\n  webroot: public\n')
    expect(new LocalPathDefault(dir).resolve()).toBe(path.join(dir, 'public'))
  })

  it('uses the project directory when the webroot is "."', () => {
    writeLando('name: site\nconfig:\n  webroot: .\n')
    expect(new LocalPathDefault(dir).resolve()).toBe(dir)
  })

  it('uses the project directory when .lando.yml has no webroot', () => {
    writeLando('name: site\nrecipe: wordpress\n')
    expect(new LocalPathDefault(dir).resolve()).toBe(dir)
  })

  it('uses the project directory when .lando.yml is not valid YAML', () => {
    writeLando('config: [unclosed\n')
    expect(new LocalPathDefault(dir).resolve()).toBe(dir)
  })
})
