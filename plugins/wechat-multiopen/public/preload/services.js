const fs = require('node:fs')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')

const DB_KEY = 'wechat-multiopen-config'
const LOG_FILE = path.join(__dirname, '..', 'wechat-multiopen.log')

const DEFAULT_WECHAT_PATHS = [
  'C:\\Program Files\\Tencent\\Weixin\\Weixin.exe',
  'C:\\Program Files\\Tencent\\WeChat\\WeChat.exe',
  'C:\\Program Files (x86)\\Tencent\\Weixin\\Weixin.exe',
  'C:\\Program Files (x86)\\Tencent\\WeChat\\WeChat.exe'
]

function log(message, data) {
  const line = JSON.stringify({
    time: new Date().toISOString(),
    message,
    data: data || null
  })

  try {
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8')
  } catch (_error) {
    // Logging must not break the plugin.
  }

  try {
    console.log('[wechat-multiopen]', message, data || '')
  } catch (_error) {
    // Console logging is best-effort.
  }
}

function isFile(filePath) {
  try {
    return Boolean(filePath) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()
  } catch (_error) {
    return false
  }
}

function isDirectory(filePath) {
  try {
    return Boolean(filePath) && fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()
  } catch (_error) {
    return false
  }
}

function findWeChatInDirectory(dirPath) {
  if (!isDirectory(dirPath)) return ''

  const directMatch = ['Weixin.exe', 'WeChat.exe']
    .map((fileName) => path.join(dirPath, fileName))
    .find(isFile)
  if (directMatch) return directMatch

  try {
    const childDirs = fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(dirPath, entry.name))

    for (const childDir of childDirs) {
      const childMatch = ['Weixin.exe', 'WeChat.exe']
        .map((fileName) => path.join(childDir, fileName))
        .find(isFile)
      if (childMatch) return childMatch
    }
  } catch (error) {
    log('findWeChatInDirectory failed', { dirPath, error: String(error) })
  }

  return ''
}

function resolveWeChatPath(inputPath) {
  const rawPath = typeof inputPath === 'string' ? inputPath.trim() : ''
  if (!rawPath) return ''
  if (isFile(rawPath)) return rawPath
  return findWeChatInDirectory(rawPath)
}

function normalizeCount(value) {
  const count = Math.floor(Number(value))
  if (!Number.isFinite(count)) return 2
  return Math.max(1, Math.min(count, 20))
}

function readConfig() {
  try {
    const config = window.ztools.dbStorage.getItem(DB_KEY)
    if (!config || typeof config !== 'object') return {}
    return config
  } catch (error) {
    log('readConfig failed', { error: String(error) })
    return {}
  }
}

function saveConfig(config) {
  const wechatPath = resolveWeChatPath(config.wechatPath)
  if (config.wechatPath && !wechatPath) {
    throw new Error('请选择 Weixin.exe。')
  }

  const nextConfig = {
    wechatPath,
    count: normalizeCount(config.count)
  }
  window.ztools.dbStorage.setItem(DB_KEY, nextConfig)
  log('saveConfig', nextConfig)
  return nextConfig
}

function findWeChatPath() {
  const config = readConfig()
  const savedPath = resolveWeChatPath(config.wechatPath)
  if (savedPath) return savedPath
  return DEFAULT_WECHAT_PATHS.find(isFile) || ''
}

function getWeChatProcessCount() {
  const names = ['Weixin.exe', 'WeChat.exe']
  let count = 0

  for (const name of names) {
    const result = spawnSync('tasklist.exe', ['/FI', `IMAGENAME eq ${name}`, '/FO', 'CSV', '/NH'], {
      windowsHide: true,
      encoding: 'utf8'
    })

    count += (result.stdout.match(new RegExp(`"${name.replace('.', '\\.')}"`, 'gi')) || []).length
  }

  return count
}

function spawnWeChat(wechatPath) {
  const child = spawn(wechatPath, [], {
    cwd: path.dirname(wechatPath),
    detached: true,
    stdio: 'ignore',
    windowsHide: false
  })
  child.unref()
  return child.pid
}

function launchWeChat(count, customPath) {
  log('launch requested', { count, customPath })

  if (process.platform !== 'win32') {
    throw new Error('微信多开目前只支持 Windows。')
  }

  const launchCount = normalizeCount(count)
  const wechatPath = resolveWeChatPath(customPath) || findWeChatPath()

  if (!isFile(wechatPath)) {
    const error = '没有找到微信主程序，请在设置里选择 Weixin.exe 或微信安装目录。'
    log('launch failed: missing executable', { customPath, resolvedPath: wechatPath })
    throw new Error(error)
  }

  const pids = []

  try {
    for (let index = 0; index < launchCount; index += 1) {
      pids.push(spawnWeChat(wechatPath))
    }
  } catch (error) {
    log('direct spawn failed', { error: String(error), wechatPath })
    throw error
  }

  log('launch dispatched', { wechatPath, launchCount, pids })

  saveConfig({ wechatPath, count: launchCount })
  return { wechatPath, count: launchCount }
}

function pickWeChatPath() {
  const files = window.ztools.showOpenDialog({
    title: '选择 Weixin.exe',
    properties: ['openFile'],
    filters: [{ name: 'Weixin.exe / WeChat.exe', extensions: ['exe'] }]
  })

  const selectedPath = Array.isArray(files) ? files[0] || '' : ''
  const selectedName = path.basename(selectedPath).toLowerCase()
  const resolvedPath = ['weixin.exe', 'wechat.exe'].includes(selectedName) ? selectedPath : ''
  log('pickWeChatPath', { selectedPath, resolvedPath })

  if (selectedPath && !resolvedPath) {
    throw new Error('请选择微信主程序 Weixin.exe。')
  }

  return resolvedPath
}

function notify(message) {
  try {
    window.ztools.showNotification(message)
  } catch (error) {
    log('notify failed', { message, error: String(error) })
  }
}

window.services = {
  defaultPaths: DEFAULT_WECHAT_PATHS,
  findWeChatPath,
  getLogFilePath: () => LOG_FILE,
  getWeChatProcessCount,
  isFile,
  launchWeChat,
  log,
  notify,
  pickWeChatPath,
  readConfig,
  resolveWeChatPath,
  saveConfig
}
