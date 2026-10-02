const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')

/**
 * Default local WordPress path for a project: the Lando webroot when
 * .lando.yml sets one, otherwise the project directory itself.
 */
class LocalPathDefault {
  /**
   * @param {string} projectDir - Directory the project is being set up in
   */
  constructor (projectDir) {
    this.projectDir = projectDir
  }

  /**
   * @returns {string}
   */
  resolve () {
    const webroot = this.landoWebroot()
    return webroot ? path.join(this.projectDir, webroot) : this.projectDir
  }

  landoWebroot () {
    const landoFile = path.join(this.projectDir, '.lando.yml')
    if (!fs.existsSync(landoFile)) return null
    try {
      const lando = yaml.load(fs.readFileSync(landoFile, 'utf8'))
      const webroot = lando && lando.config && lando.config.webroot
      return typeof webroot === 'string' ? webroot : null
    } catch {
      return null
    }
  }
}

module.exports = { LocalPathDefault }
