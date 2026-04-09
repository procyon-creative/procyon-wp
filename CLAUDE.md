# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Procyon CLI is a WordPress development toolkit that automates database syncing, file transfers, and environment management between local, staging, and live environments. It's built with yargs for command-line parsing.

## Commands

```bash
# Install dependencies
pnpm install

# Lint (runs on pre-commit via husky)
npm run lint

# Run tests
npm test

# Run CLI locally during development
node index.js <command> [options]

# Install globally for testing
npm link
```

## Architecture

**Entry Point:** `index.js` - Sets up yargs with `loadProjectMiddleware` that:
1. Skips config for setup commands (`init`, `migrate`, `projects`)
2. Loads `.procyon` config from current directory, attaches as `argv.project`
3. Exits with error if no `.procyon` link exists

**Config System:** `src/config/`
- `store.js` - CRUD for `~/.procyon/projects/*.json`, project linking
- `schema.js` - Validation for project configs and `.procyon` link files

**Sync System:** `src/sync/`
- `rsync.js` - `RsyncTransfer` class wrapping rsync with SSH, excludes, dry-run, and itemize-changes parsing
- `backup.js` - Timestamped backups at `~/.procyon/backups/<project>/<env>/<item>/<timestamp>/`

**Command Structure:** Uses yargs `commandDir` pattern:
```
commands/
├── init.js            # Interactive project setup wizard
├── migrate.js         # Import .env to new config format
├── projects.js        # List/show/remove registered projects
├── plugin.js          # Install plugins from CSV
├── db.js              # Parent: 'db <command>'
├── db/
│   ├── pull.js
│   └── push.js
├── files.js           # Parent: 'files <command>'
└── files/
    ├── pull.js        # Rsync pull with --name and --dry-run
    ├── push.js        # Rsync push with diff preview, backup, confirmation
    └── rollback.js    # Restore from timestamped backups
```

**Static Files:** `bin/rsync-exclude` - Default exclude patterns for rsync transfers.

## Configuration

Run `procyon init` to create `~/.procyon/projects/<name>.json` and a `.procyon` link file in the project directory. Use `procyon migrate` to import from a legacy `.env` file.

## Environment Detection

- Lando detection: If `wpCli` is `"lando wp"` in project config
- WP Engine detection: Commands check for "wpe-user" in paths for special export handling

## Testing

- vitest v4 (ESM-only imports, `createRequire` for CJS source)
- `store.paths` object is mutable for test isolation (temp dirs)
- 45 tests across 4 files: schema, store, rsync, backup
