exports.command = 'db <command>'
exports.desc = 'Perform db transfer operations'
exports.builder = function (yargs) {
  return yargs.commandDir('db')
}
exports.handler = function (argv) {}
