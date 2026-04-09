# Procyon CLI Refactoring Plan

## Goals
1. ~~Replace `.env` files with centralized config in `~/.procyon/`~~  DONE
2. ~~Interactive project setup wizard~~  DONE
3. ~~Refactor `files` command to support single theme transfers~~  DONE
4. ~~Keep rsync for delta transfers, wrap in JavaScript~~  DONE
5. ~~Add diff preview before pushing changes~~  DONE
6. ~~Add rollback capability for pushes~~  DONE
7. ~~Migrate db commands to new config system~~  DONE
8. ~~Remove legacy shell scripts and dead code~~  DONE
9. ~~Migrate remaining legacy commands (plugin, plugin-sync, setup)~~  DONE

---

## Completed Phases

### Phase 1: Config System  DONE
- `src/config/store.js` — CRUD for `~/.procyon/projects/*.json`, project linking
- `src/config/schema.js` — Validation for project and link files
- `commands/init.js` — Interactive project setup wizard
- `commands/projects.js` — List/show/remove projects
- `commands/migrate.js` — Import from .env to new config
- `index.js` — Middleware loads `.procyon` config, attaches as `argv.project`

### Phase 2: Rsync Wrapper  DONE
- `src/sync/rsync.js` — `RsyncTransfer` class with pull/push/dryRun/ssh methods
- `commands/files/pull.js` — Rsync pull with `--name` and `--dry-run`
- `commands/files/push.js` — Rsync push with diff preview, backup, confirmation

### Phase 3: Diff Preview  DONE (built into push command)
- `dryRun()` method uses rsync `--itemize-changes`, parsed into added/modified/deleted
- Push shows preview and prompts for confirmation (skip with `--force`)

### Phase 4: Backup & Rollback  DONE
- `src/sync/backup.js` — Backup to `~/.procyon/backups/<project>/<env>/<item>/<timestamp>/`
- `commands/files/rollback.js` — List backups and restore from timestamp
- Push auto-backs up before transfer (skip with `--no-backup`)

### Phase 5: Cleanup  DONE
- `.gitignore` updated with `.procyon`
- Lint script expanded to cover `commands/**/*.js` and `src/**/*.js`
- Fixed pre-existing lint errors (path concat, unused imports, unused expressions)
- README.md rewritten with new command docs
- CLAUDE.md updated with new architecture
- vitest added with 45 tests across 4 files

### Phase 6: DB Commands  DONE
- `commands/db/pull.js` — Rewritten with new config system
- `commands/db/push.js` — Rewritten with new config system
- Fixed `RsyncTransfer.ssh()` to include identity file
- Added `localDomain` and per-env `domain` fields for search-replace

### Phase 7: Remove Legacy Code  DONE
- Deleted all shell scripts from `bin/` (kept `bin/rsync-exclude`)
- Deleted `bin/inc/` helper scripts directory
- Deleted dead code: `src/update-env.js`, `src/readVariablesFromTemplate.js`, `src/runCommand.js`
- Deleted legacy commands: `lsCommand.js`, `plugin-sync.js`, `setup/local.js`, `config/create.js`
- Removed shell script fallback branches from files/pull, files/push, db/pull, db/push
- Commands now use `argv.project` directly instead of `getProjectFromCwd()` per-command
- Removed `toEnv()` bridge from store.js (no longer needed without shell scripts)
- Simplified `index.js`: removed `.env` fallback, `loadEnvFallback()`, `checkEnvKeys()`
- Migrated `plugin.js` to use `argv.project.wpCli` instead of `process.env.WP`
- Removed unused dependencies: `dotenv`, `readline-sync`, `handlebars`, `csv-writer`

---

## Configuration

### Project Config Schema (`~/.procyon/projects/<name>.json`)
```json
{
  "name": "my-site",
  "localPath": "/Users/nick/Sites/my-site/public",
  "localDomain": "my-site.local",
  "wpCli": "wp",
  "environments": {
    "staging": {
      "host": "staging.example.com",
      "user": "deploy",
      "port": 22,
      "path": "/var/www/html",
      "domain": "staging.example.com",
      "identityFile": "~/.ssh/id_rsa"
    }
  },
  "exclude": [
    "*.zip", "*.log", ".git", "node_modules/"
  ]
}
```

### Project Linking
In each WordPress project directory, a `.procyon` file links to the config:
```json
{
  "project": "my-site"
}
```
