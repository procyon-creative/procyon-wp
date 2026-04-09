Procyon CLI
=
A WordPress development toolkit that automates database syncing, file transfers, and environment management between local, staging, and live environments.

## Installation
```
npm install -g procyon-cli
```

Or check out the repo and run:
```
npm link
```

## Quick Start

### New project
```bash
procyon init
```

Interactive wizard that creates a project config at `~/.procyon/projects/<name>.json` and a `.procyon` link file in your project directory.

### Migrating from .env
```bash
procyon migrate
```

Imports an existing `.env` file into the new config format.

## Commands

### File Transfers

```bash
# Pull uploads from staging
procyon files pull staging uploads

# Pull all file types (themes, plugins, uploads)
procyon files pull staging all

# Pull a single theme
procyon files pull staging themes --name flavor

# Push themes to staging (shows diff preview, creates backup)
procyon files push staging themes

# Push a single plugin, skip confirmation
procyon files push staging plugins --name my-plugin --force

# Preview what would change without transferring
procyon files push staging themes --dry-run

# Push without creating a backup
procyon files push live themes --no-backup
```

### Rollback

```bash
# List available backups
procyon files rollback staging themes --list

# Restore from a specific backup
procyon files rollback staging themes --to 2024-01-15T10-30-00
```

### Database

```bash
# Pull remote database, import locally, search-replace domains
procyon db pull staging

# Push local database to remote (prompts for confirmation)
procyon db push staging

# Push without confirmation
procyon db push staging -y
```

### Plugin Install

```bash
# Install plugins from a CSV file
procyon plugin-install staging plugins.csv
```

### Project Management

```bash
procyon projects list          # List all registered projects
procyon projects show          # Show current project config
procyon projects remove --name my-site
```

## Configuration

Project configs live at `~/.procyon/projects/<name>.json`:

```json
{
  "name": "my-site",
  "localPath": "/Users/you/Sites/my-site/public",
  "localDomain": "my-site.local",
  "wpCli": "wp",
  "environments": {
    "staging": {
      "host": "staging.example.com",
      "user": "deploy",
      "port": 22,
      "path": "/var/www/html",
      "domain": "staging.example.com",
      "identityFile": "~/.ssh/my-key"
    },
    "live": {
      "host": "live.example.com",
      "user": "deploy",
      "port": 22,
      "path": "/var/www/html",
      "domain": "live.example.com",
      "identityFile": "~/.ssh/my-key"
    }
  }
}
```

Each project directory contains a `.procyon` link file pointing to the config:
```json
{
  "project": "my-site"
}
```

- **localDomain** / **domain**: Used for database search-replace during `db pull` and `db push`.
- **identityFile**: SSH key path. Supports `~` for home directory.
- **wpCli**: Set to `"lando wp"` for Lando-based projects.

## Development

```bash
pnpm install
npm test
npm run lint
node index.js <command> [options]
```
