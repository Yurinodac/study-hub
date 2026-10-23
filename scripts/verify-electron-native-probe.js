/* Run only inside Electron (not plain Node). */
const path = require('path')
const projectRoot = path.resolve(__dirname, '..')
process.chdir(projectRoot)
module.paths.unshift(path.join(projectRoot, 'node_modules'))

const abi = process.versions.modules
const electronVersion = process.versions.electron

if (!electronVersion) {
  console.error(
    'verify-electron-native: this probe was started without Electron (no process.versions.electron).'
  )
  process.exit(1)
}

try {
  require('better-sqlite3')
  console.log(
    `verify-electron-native: OK better-sqlite3 loads in Electron ${electronVersion} (ABI ${abi})`
  )
  process.exit(0)
} catch (err) {
  console.error(
    'verify-electron-native: FAILED — better-sqlite3 does not match this Electron runtime.'
  )
  console.error(`Electron ${electronVersion} expects NODE_MODULE_VERSION ${abi}`)
  console.error(String(err && err.message ? err.message : err))
  console.error(
    'Fix: delete node_modules/better-sqlite3/build, run npx electron-rebuild -f -w better-sqlite3, then rebuild.'
  )
  process.exit(1)
}
