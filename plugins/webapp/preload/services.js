const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const https = require('node:https')
const zlib = require('node:zlib')
const { URL } = require('node:url')

// ============================================
// 读取 stream 为 Buffer
// ============================================
function readStream(stream, encoding) {
  return new Promise((resolve, reject) => {
    let source = stream
    if (encoding) {
      const enc = encoding.toLowerCase().trim()
      if (enc === 'gzip' || enc === 'x-gzip') source = stream.pipe(zlib.createGunzip())
      else if (enc === 'deflate') source = stream.pipe(zlib.createInflate())
      else if (enc === 'br') source = stream.pipe(zlib.createBrotliDecompress())
    }
    const chunks = []
    source.on('data', c => chunks.push(c))
    source.on('end', () => resolve(Buffer.concat(chunks)))
    source.on('error', reject)
  })
}

// ============================================
// Cookie Jar：代理维护 session，持久化到文件
// ============================================
const JAR_FILE = path.join(
  window.ztools.getPath('userData') || path.join(process.env.USERPROFILE, '.ztools'),
  'webapp-cookies.json'
)
const appJars = new Map() // appId → Map<name, value>

// 启动时加载持久化的 cookie
function jarLoad() {
  try {
    if (fs.existsSync(JAR_FILE)) {
      const data = JSON.parse(fs.readFileSync(JAR_FILE, 'utf-8'))
      for (const [appId, entries] of Object.entries(data)) {
        appJars.set(appId, new Map(Object.entries(entries)))
      }
      console.log('[CookieJar] 已加载:', [...appJars.keys()].join(', '))
    }
  } catch (e) {
    console.error('[CookieJar] 加载失败:', e.message)
  }
}

// 持久化到文件
function jarSave() {
  try {
    const data = {}
    for (const [appId, jar] of appJars) {
      data[appId] = Object.fromEntries(jar)
    }
    const dir = path.dirname(JAR_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(JAR_FILE, JSON.stringify(data, null, 2), 'utf-8')
  } catch (e) {
    console.error('[CookieJar] 保存失败:', e.message)
  }
}

jarLoad()

function jarSet(appId, setCookieHeader) {
  if (!appJars.has(appId)) appJars.set(appId, new Map())
  const jar = appJars.get(appId)
  const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader]
  let changed = false
  for (const c of cookies) {
    const mainPart = c.split(';')[0].trim()
    const eqIdx = mainPart.indexOf('=')
    if (eqIdx === -1) continue
    const name = mainPart.substring(0, eqIdx).trim()
    const value = mainPart.substring(eqIdx + 1).trim()
    const isDelete = /Max-Age=0/i.test(c) || /Expires=.*(?:1970|1969)/i.test(c)
    if (isDelete || value === '') {
      jar.delete(name)
      changed = true
    } else {
      jar.set(name, value)
      changed = true
    }
  }
  if (changed) jarSave()
}

function jarGetHeader(appId) {
  const jar = appJars.get(appId)
  if (!jar || jar.size === 0) return null
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

// ============================================
// 每个应用独立代理（独立端口，类似 nginx server block）
// ============================================
const appServers = new Map() // appId → { server, port }

function createAppProxy(appId, targetUrl, username, password) {
  const base = targetUrl.replace(/\/+$/, '')
  const targetObj = new URL(base)
  const targetOrigin = targetObj.origin
  const targetHost = targetObj.host

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const fullUrl = base + req.url
        const reqTargetObj = new URL(fullUrl)
        const client = reqTargetObj.protocol === 'https:' ? https : http

        // 构造转发请求头
        const fwdHeaders = {}
        const passHeaders = ['accept', 'accept-language', 'content-type', 'x-requested-with']
        for (const h of passHeaders) {
          if (req.headers[h]) fwdHeaders[h] = req.headers[h]
        }
        // 注入 Basic Auth
        if (username) {
          fwdHeaders['authorization'] = 'Basic ' + Buffer.from(username + ':' + password).toString('base64')
        }
        // 从 Cookie Jar 注入 session cookie（不依赖浏览器）
        const jarCookie = jarGetHeader(appId)
        if (jarCookie) {
          fwdHeaders['cookie'] = jarCookie
        }

        // 发起代理请求
        const proxyRes = await new Promise((resolveRes, rejectRes) => {
          const proxyReq = client.request(reqTargetObj, {
            method: req.method,
            headers: fwdHeaders,
            timeout: 30000
          }, resolveRes)
          proxyReq.on('error', rejectRes)
          proxyReq.on('timeout', () => { proxyReq.destroy(); rejectRes(new Error('timeout')) })
          if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
            req.pipe(proxyReq)
          } else {
            proxyReq.end()
          }
        })

        // 读取响应体
        const body = await readStream(proxyRes, proxyRes.headers['content-encoding'])

        // 构造响应头（不传 Set-Cookie 给浏览器，全部由 Jar 管理）
        const resHeaders = {}
        const skipHeaders = new Set([
          'transfer-encoding', 'content-encoding',
          'content-security-policy', 'content-security-policy-report-only',
          'x-frame-options', 'set-cookie'
        ])
        for (const [k, v] of Object.entries(proxyRes.headers)) {
          if (skipHeaders.has(k)) continue
          // 改写 Location 跳转地址
          if (k === 'location') {
            let loc = v
            if (loc.startsWith(targetOrigin)) {
              loc = loc.replace(targetOrigin, 'http://127.0.0.1:' + server.address().port)
            }
            resHeaders[k] = loc
          } else {
            resHeaders[k] = v
          }
        }
        resHeaders['access-control-allow-origin'] = '*'

        // 将 Set-Cookie 存入 Jar（不传给浏览器）
        if (proxyRes.headers['set-cookie']) {
          jarSet(appId, proxyRes.headers['set-cookie'])
          console.log(`[Proxy:${appId}] Cookie Jar:`, [...appJars.get(appId).entries()].map(([k]) => k).join(', '))
        }

        const ct = (proxyRes.headers['content-type'] || '').toLowerCase()

        // HTML URL 重写
        if (ct.includes('text/html')) {
          let html = body.toString('utf-8')
          const proxyBase = 'http://127.0.0.1:' + server.address().port
          while (html.includes(targetOrigin)) {
            html = html.replace(targetOrigin, proxyBase)
          }
          const protoRelative = '//' + targetHost
          while (html.includes(protoRelative)) {
            html = html.replace(protoRelative, proxyBase)
          }
          const newBody = Buffer.from(html, 'utf-8')
          resHeaders['content-length'] = newBody.length
          res.writeHead(proxyRes.statusCode, resHeaders)
          res.end(newBody)
        } else {
          resHeaders['content-length'] = body.length
          res.writeHead(proxyRes.statusCode, resHeaders)
          res.end(body)
        }
      } catch (err) {
        console.error(`[Proxy:${appId}] Error:`, err.message)
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('Proxy error: ' + err.message)
        }
      }
    })

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      console.log(`[Proxy:${appId}] started on port ${port} → ${targetUrl}`)
      resolve({ server, port })
    })

    server.on('error', reject)
  })
}

async function setupAppProxy(appId, targetUrl, username, password) {
  // 已有运行中的代理，直接复用（保留 cookie）
  if (appServers.has(appId)) {
    const entry = appServers.get(appId)
    return `http://127.0.0.1:${entry.port}/`
  }
  const { server, port } = await createAppProxy(appId, targetUrl, username, password)
  appServers.set(appId, { server, port })
  return `http://127.0.0.1:${port}/`
}

function getProxyUrl(appId) {
  const entry = appServers.get(appId)
  if (!entry) return null
  return `http://127.0.0.1:${entry.port}/`
}

function removeAppProxy(appId) {
  if (appServers.has(appId)) {
    try { appServers.get(appId).server.close() } catch {}
    appServers.delete(appId)
    appJars.delete(appId)
  }
}

// ============================================
// 通过 window 向渲染进程注入 nodejs 能力
// ============================================
window.services = {
  getConfigPath() {
    const userDataPath = window.ztools.getPath('userData') || path.join(process.env.USERPROFILE, '.ztools')
    return path.join(userDataPath, 'webapp-configs.json')
  },

  readConfig() {
    try {
      const configPath = this.getConfigPath()
      if (fs.existsSync(configPath)) {
        const data = fs.readFileSync(configPath, { encoding: 'utf-8' })
        return JSON.parse(data)
      }
    } catch (e) {
      console.error('读取配置失败:', e)
    }
    return []
  },

  saveConfig(configs) {
    try {
      const configPath = this.getConfigPath()
      const dir = path.dirname(configPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(configPath, JSON.stringify(configs, null, 2), { encoding: 'utf-8' })
      return true
    } catch (e) {
      console.error('保存配置失败:', e)
      return false
    }
  },

  setupAppProxy,
  getProxyUrl,
  removeAppProxy
}
