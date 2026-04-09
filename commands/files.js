exports.command = 'files <command>'
exports.desc = 'Perform file transfer operations'
exports.builder = function (yargs) {
  return yargs.commandDir('files')
}
exports.handler = function (argv) {}
