import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { parseEnvFile, parseSSHString } = require('../commands/migrate')

describe('parseEnvFile', () => {
  it('parses key=value pairs', () => {
    const result = parseEnvFile('FOO=bar\nBAZ=qux')
    expect(result).toEqual({ FOO: 'bar', BAZ: 'qux' })
  })

  it('strips surrounding quotes', () => {
    const result = parseEnvFile('FOO="bar"\nBAZ=\'qux\'')
    expect(result).toEqual({ FOO: 'bar', BAZ: 'qux' })
  })

  it('skips comments and blank lines', () => {
    const result = parseEnvFile('# comment\n\nFOO=bar\n  # another comment\n')
    expect(result).toEqual({ FOO: 'bar' })
  })

  it('handles values with equals signs', () => {
    const result = parseEnvFile('URL=https://example.com?a=1&b=2')
    expect(result).toEqual({ URL: 'https://example.com?a=1&b=2' })
  })
})

describe('parseSSHString', () => {
  it('parses user@host', () => {
    const result = parseSSHString('deploy@example.com')
    expect(result).toEqual({ host: 'example.com', user: 'deploy', port: 22 })
  })

  it('parses user@host:port', () => {
    const result = parseSSHString('deploy@example.com:18765')
    expect(result).toEqual({ host: 'example.com', user: 'deploy', port: 18765 })
  })

  it('parses host-only string', () => {
    const result = parseSSHString('example.com')
    expect(result.host).toBe('example.com')
    expect(result.port).toBe(22)
  })
})
