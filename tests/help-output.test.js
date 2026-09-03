import { describe, it, expect } from 'vitest'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const indexPath = path.join(__dirname, '..', 'index.js')

function help (args) {
  return execFileSync('node', [indexPath, ...args, '--help'], {
    encoding: 'utf8',
    cwd: __dirname
  })
}

function section (output, heading) {
  const lines = output.split('\n')
  const start = lines.indexOf(`${heading}:`)
  if (start === -1) return ''
  const rest = lines.slice(start + 1)
  const end = rest.findIndex(line => /^\S/.test(line))
  return (end === -1 ? rest : rest.slice(0, end)).join('\n')
}

describe('help output', () => {
  it('lists the projects action as a positional, not an option', () => {
    const output = help(['projects'])
    expect(section(output, 'Positionals')).toMatch(/\baction\b/)
    expect(section(output, 'Options')).not.toMatch(/--action/)
  })

  const commands = [
    { args: ['db', 'pull'], positionals: ['target'] },
    { args: ['db', 'push'], positionals: ['target'] },
    { args: ['files', 'pull'], positionals: ['target', 'item', 'name'] },
    { args: ['files', 'push'], positionals: ['target', 'item', 'name'] },
    { args: ['files', 'rollback'], positionals: ['target', 'item'] },
    { args: ['files', 'sync'], positionals: ['target'] },
    { args: ['plugin-install'], positionals: ['target', 'csv'] }
  ]

  it.each(commands)('lists $args positionals under Positionals', ({ args, positionals }) => {
    const output = help(args)
    const positionalsSection = section(output, 'Positionals')
    const optionsSection = section(output, 'Options')
    for (const name of positionals) {
      expect(positionalsSection).toMatch(new RegExp(`^\\s+${name}\\s+\\S`, 'm'))
      expect(optionsSection).not.toMatch(new RegExp(`--${name}\\b`))
    }
  })
})
