/**
 * Fail the build if better-sqlite3 cannot load inside Electron
 * (catches Node ABI 127 vs Electron 34 ABI 132 mismatches).
 */
const { spawnSync } = require('child_process')
const path = require('path')

const electronPath = require('electron')
const electronVersion = require('electron/package.json').version
const projectRoot = path.resolve(__dirname, '..')
const probePath = path.join(__dirname, 'verify-electron-native-probe.js')

const result = spawnSync(electronPath, [probePath], {
  cwd: projectRoot,
  encoding: 'utf8',
  env: {
    ...process.env,
    // Must NOT set ELECTRON_RUN_AS_NODE — that would test against Node ABI instead of Electron.
    ELECTRON_NO_ATTACH_CONSOLE: '1'
  },
  timeout: 120000
})

if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)

if (result.error) {
  console.error('verify-electron-native: could not launch Electron', result.error.message)
  console.error('Installed electron package version:', electronVersion)
  process.exit(1)
}

if (result.status !== 0) {
  process.exit(result.status === null ? 1 : result.status)
}
