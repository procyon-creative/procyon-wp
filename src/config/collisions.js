const { prompt } = require('enquirer')
const { findProjectConflicts } = require('./store')

/**
 * Turns a conflict report into the warnings a human needs to see.
 */
function describeConflicts (conflicts) {
  const messages = []
  if (conflicts.name) {
    messages.push(
      `Project "${conflicts.name.name}" already exists and points at ${conflicts.name.projectPath}. Saving will overwrite it.`
    )
  }
  if (conflicts.path) {
    messages.push(
      `This directory is already linked to project "${conflicts.path.name}". Saving will leave two projects pointing at it.`
    )
  }
  return messages
}

/**
 * Warns about name and path collisions, then asks whether to continue.
 * Returns true when there is nothing to warn about, when `skipPrompt` is set,
 * or when the user confirms.
 */
async function confirmProjectName (name, projectPath, skipPrompt) {
  const messages = describeConflicts(findProjectConflicts(name, projectPath))
  if (messages.length === 0) {
    return true
  }

  for (const message of messages) {
    console.warn(message)
  }
  if (skipPrompt) {
    return true
  }

  const { proceed } = await prompt({
    type: 'confirm',
    name: 'proceed',
    message: 'Continue anyway?',
    initial: false
  })
  return proceed === true
}

module.exports = { describeConflicts, confirmProjectName }
