# ZTools 插件 API 文档
ZTools 为插件提供了一套丰富的 API，通过全局对象 `window.ztools` 暴露。

## 目录
1. [基础 API](#基础-api)
2. [事件 API](#事件-api)
3. [搜索框 API](#搜索框-api)
4. [数据库 API](#数据库-api)
5. [dbStorage 简易键值存储](#dbstorage-api)
6. [动态 Feature API](#动态-feature-api)
7. [剪贴板 API](#剪贴板-api)
8. [文件操作 API](#文件操作-api)
9. [窗口 API](#窗口-api)
10. [显示器 API](#显示器-api)
11. [Shell API](#shell-api)
12. [其他通用 API](#其他-api)
13. [AI API](#ai-api)

## 基础 API
### ztools.getAppName()
获取应用名称。
- 返回: `string` - 应用名称，固定返回 `'ZTools'`。

### ztools.getPathForFile(file)
获取拖放文件的真实路径，用于处理用户拖放文件到插件界面场景（底层基于 Electron `webUtils.getPathForFile`）。
- 参数：
  - `file: File` - 拖放事件中的 File 对象
- 返回: `string` - 文件本地路径

### ztools.isMacOs() / ztools.isMacOS()
检测当前是否为 macOS 系统。
- 返回: `boolean`

### ztools.isWindows()
检测当前是否为 Windows 系统。
- 返回: `boolean`

### ztools.isLinux()
检测当前是否为 Linux 系统。
- 返回: `boolean`

### ztools.getNativeId()
获取设备唯一标识符（32位字符串）。
- 返回: `string`

### ztools.getAppVersion()
获取应用版本号。
- 返回: `string`

### ztools.getWindowType()
获取当前窗口类型。
- 返回: `string`

### ztools.isDarkColors()
检测当前是否为深色主题。
- 返回: `boolean`

### ztools.isDev()
检查当前插件是否处于开发模式。
- 返回: `boolean`

### ztools.getWebContentsId()
获取当前 WebContents ID。
- 返回: `number`

### ztools.setExpendHeight(height)
设置插件视图高度。
- 参数：
  - `height: number` - 期望高度，单位像素

### ztools.showNotification(body)
显示系统通知。
- 参数：
  - `body: string` - 通知文本内容

### ztools.sendInputEvent(event)
发送模拟输入事件。
- 参数：
  - `event: MouseInputEvent | MouseWheelInputEvent | KeyboardInputEvent`

#### 事件对象结构
##### KeyboardInputEvent 键盘事件
```ts
{
  type: 'keyDown' | 'keyUp' | 'char',
  keyCode: string,
  modifiers: string[] // 修饰键，如 ['shift', 'control']
}
```

##### MouseInputEvent 鼠标事件
```ts
{
  type: 'mouseDown' | 'mouseUp' | 'mouseEnter' | 'mouseLeave' | 'contextMenu' | 'mouseMove',
  x: number,
  y: number,
  button: 'left' | 'middle' | 'right',
  clickCount: number
}
```

##### MouseWheelInputEvent 滚轮事件
```ts
{
  type: 'mouseWheel',
  deltaX: number,
  deltaY: number,
  wheelTicksX: number,
  wheelTicksY: number,
  accelerationRatioX: number,
  accelerationRatioY: number,
  hasPreciseScrollingDeltas: boolean,
  canScroll: boolean
}
```

### ztools.simulateKeyboardTap(key, ...modifiers)
模拟键盘按键。
- 参数：
  - `key: string` - 按键标识
  - `modifiers: string[]` 可选，修饰键数组
- 返回: `boolean` - 是否执行成功

### ztools.showMainWindow()
显示主窗口。
- 返回: `Promise<boolean>`

### ztools.hideMainWindow(isRestorePreWindow)
隐藏主窗口，同时隐藏主窗口内运行的插件。
- 参数：
  - `isRestorePreWindow?: boolean` 可选，是否将焦点切回上一个活动窗口，默认 `true`
- 返回: `Promise<boolean>`

### ztools.outPlugin(isKill)
退出插件应用，默认后台隐藏插件进程。
- 参数：
  - `isKill?: boolean` 可选，为 `true` 时强制杀死插件进程
- 返回: `Promise<boolean>`

## 事件 API
### ztools.onPluginEnter(callback)
监听插件打开事件，用户启动插件时触发。
- 参数：
  - `callback: (param: LaunchParam) => void`

#### LaunchParam 结构
```ts
{
  payload: any, // 外部传入数据，如搜索框文本
  type: 'text' | 'regex' | 'over',
  // text：普通文本匹配
  // regex：正则匹配
  // over：任意文本匹配
  code: string // Feature 触发时对应的功能码
}
```

### ztools.onPluginOut(callback)
监听插件退出事件。
- 参数：
  - `callback: (isKill: boolean) => void`
    - `isKill`：是否为强制杀死进程退出

### ztools.onPluginDetach(callback)
监听插件分离独立窗口事件，用户拖拽插件脱离主窗口时触发。
- 参数：
  - `callback: () => void`

### ztools.onMainPush(callback, selectCallback)
注册主搜索栏推送结果，无需打开插件即可展示搜索列表。
- 参数：
  - `callback: (queryData: any) => object[]`：输入查询回调，返回结果数组
  - `selectCallback?: (selectData: any) => boolean`：选中结果回调，返回 `true` 自动进入插件

### ztools.onPluginReady(callback)
兼容旧版 API，功能等同于 `onPluginEnter`。
- 参数：
  - `callback: (param: LaunchParam) => void`

## 搜索框 API
### ztools.setSubInput(onChange, placeholder, isFocus)
插件激活时配置主窗口子搜索框行为。
- 参数：
  - `onChange: (text: string) => void`：输入内容变更回调
  - `placeholder: string`：输入框占位提示文字
  - `isFocus?: boolean` 可选，自动聚焦输入框，默认 `true`

### ztools.setSubInputValue(text)
设置子输入框内容。
- 参数：
  - `text: string`

### ztools.subInputFocus()
主动聚焦子输入框。
- 返回: `boolean`

### ztools.subInputBlur()
子输入框失焦，焦点切回插件页面。
- 返回: `boolean`

### ztools.subInputSelect()
聚焦输入框并全选已有内容。
- 返回: `boolean`

### ztools.removeSubInput()
隐藏/移除子搜索框。
- 返回: `Promise<boolean>`

## 数据库 API
插件拥有独立隔离存储空间（Bucket），以插件标识隔离数据。同步方法如下：

### ztools.db.put(doc)
写入/更新文档，文档必须包含 `_id`。
- 参数：
  - `doc: object`
- 返回: `object` - 写入后的完整文档（含 `_id`、`_rev`）

### ztools.db.get(id)
根据 ID 查询文档。
- 参数：
  - `id: string`
- 返回: `object | null`，不存在返回 `null`

### ztools.db.remove(docOrId)
删除文档。
- 参数：
  - `docOrId: object | string`：完整文档对象（需 `_id/_rev`）或文档ID
- 返回: `object` - 删除结果

### ztools.db.bulkDocs(docs)
批量新增/更新文档。
- 参数：
  - `docs: object[]`
- 返回: `object[]` - 每条文档操作结果

### ztools.db.allDocs(key)
查询全部文档，支持 ID 前缀过滤。
- 参数：
  - `key?: string` 可选，文档ID前缀过滤
- 返回: `object[]`

### ztools.db.postAttachment(id, attachment, type)
为文档添加二进制附件。
- 参数：
  - `id: string` 文档ID
  - `attachment: string | Buffer` base64字符串或二进制Buffer
  - `type: string` MIME类型
- 返回: `object`

### ztools.db.getAttachment(id)
读取文档附件二进制内容。
- 参数：
  - `id: string`
- 返回: `Buffer`

### ztools.db.getAttachmentType(id)
获取附件 MIME 类型。
- 参数：
  - `id: string`
- 返回: `string`

### Promise 异步版本数据库
所有同步方法均存在异步 Promise 实现，挂载于 `ztools.db.promises`，方法签名一致，返回 Promise：
```js
window.ztools.db.promises.put(doc)
window.ztools.db.promises.get(id)
window.ztools.db.promises.remove(docOrId)
window.ztools.db.promises.bulkDocs(docs)
window.ztools.db.promises.allDocs(key)
window.ztools.db.promises.postAttachment(id, attachment, type)
window.ztools.db.promises.getAttachment(id)
window.ztools.db.promises.getAttachmentType(id)
```

## dbStorage API
轻量化键值持久化存储，类似 localStorage，自动 JSON 序列化。
### ztools.dbStorage.setItem(key, value)
- 参数：
  - `key: string`
  - `value: any` 任意可序列化数据

### ztools.dbStorage.getItem(key)
- 参数：
  - `key: string`
- 返回: `any | null`，无数据返回 `null`

### ztools.dbStorage.removeItem(key)
删除指定键。
- 参数：
  - `key: string`

## 动态 Feature API
### ztools.getFeatures(codes)
获取动态注册功能项。
- 参数：
  - `codes?: string[]` 可选，指定功能码列表，不传返回全部
- 返回: `object[]` Feature 数组

### ztools.setFeature(feature)
新增/更新动态 Feature。
- 参数：
  - `feature: object`
- 返回: `boolean`

### ztools.removeFeature(code)
删除指定 Feature。
- 参数：
  - `code: string` Feature 唯一编码
- 返回: `boolean`

## 剪贴板 API
### ztools.clipboard.getHistory(page, pageSize, filter)
分页读取剪贴板历史记录。
- 参数：
  - `page: number` 页码，从 1 开始
  - `pageSize: number` 单页条数
  - `filter?: string` 过滤关键词
- 返回: `Promise<object>`

### ztools.clipboard.search(keyword)
全文检索剪贴板历史。
- 参数：
  - `keyword: string`
- 返回: `Promise<object[]>`

### ztools.clipboard.delete(id)
删除单条剪贴板历史记录。
- 参数：
  - `id: string` 记录ID
- 返回: `Promise<boolean>`

### ztools.clipboard.clear(type)
清空剪贴板历史，支持类型过滤。
- 参数：
  - `type?: string` 可选，指定数据类型
- 返回: `Promise<boolean>`

### ztools.clipboard.getStatus()
读取剪贴板模块运行状态。
- 返回: `Promise<object>`

### ztools.clipboard.write(id, shouldPaste)
将历史记录重新写入系统剪贴板。
- 参数：
  - `id: string` 记录ID
  - `shouldPaste?: boolean` 可选，写入后模拟粘贴，默认 `true`
- 返回: `Promise<boolean>`

### ztools.clipboard.writeContent(data, shouldPaste)
自定义内容写入剪贴板。
- 参数：
  ```ts
  data: {
    type: 'text' | 'image',
    content: string // 文本或base64图片
  }
  ```
  - `shouldPaste?: boolean` 可选，默认 `true`
- 返回: `Promise<boolean>`

### ztools.clipboard.updateConfig(config)
修改剪贴板模块全局配置。
- 参数：
  - `config: object`
- 返回: `Promise<boolean>`

### ztools.clipboard.onChange(callback)
监听剪贴板新增记录事件。
- 参数：
  - `callback: (item: object) => void`

### ztools.copyText(text)
快速复制文本到剪贴板（同步）。
- 参数：
  - `text: string`
- 返回: `boolean`

### ztools.copyImage(image)
复制图片到剪贴板。
- 参数：
  - `image: string` base64 DataURL 或本地文件路径
- 返回: `boolean`

### ztools.copyFile(filePath)
复制文件到剪贴板。
- 参数：
  - `filePath: string` 文件完整路径
- 返回: `boolean`

## 文件操作 API
### ztools.getPath(name)
获取系统标准目录路径。
- 参数：
  - `name: string` 目录标识，支持 `home` / `desktop` / `documents` 等
- 返回: `string`

### ztools.showSaveDialog(options)
弹出文件保存窗口（同步）。
- 参数：
  - `options: SaveDialogOptions` 配置同 Electron `showSaveDialogSync`
- 返回: `string | undefined` 用户选择路径，取消返回 `undefined`

### ztools.showOpenDialog(options)
弹出文件选择窗口（同步）。
- 参数：
  - `options: OpenDialogOptions` 配置同 Electron `showOpenDialogSync`
- 返回: `string[] | undefined` 选中文件路径数组，取消返回 `undefined`

### ztools.screenCapture(callback)
唤起系统截图工具，截图完成回调返回图片。
- 参数：
  - `callback: (image: string) => void`
    - `image`：截图 base64 DataURL

## 窗口 API
### ztools.createBrowserWindow(url, options, callback)
创建独立浏览器窗口。
- 参数：
  - `url: string` 页面加载地址
  - `options: object` 窗口配置，兼容 Electron BrowserWindow 参数
  - `callback?: () => void` 可选，窗口加载完成回调
- 返回: `Proxy<BrowserWindow> | null` 窗口代理对象，创建失败返回 `null`

### ztools.sendToParent(channel, ...args)
向父窗口发送 IPC 消息。
- 参数：
  - `channel: string` 消息通道名
  - `args: any[]` 透传参数列表

## 显示器 API
### ztools.getPrimaryDisplay()
获取主显示器信息。
- 返回: `object`

### ztools.getAllDisplays()
获取全部显示器列表。
- 返回: `object[]`

### ztools.getCursorScreenPoint()
获取鼠标光标屏幕坐标。
- 返回: `{ x: number, y: number }`

### ztools.getDisplayNearestPoint(point)
根据坐标查找最近的显示器。
- 参数：
  - `point: { x: number, y: number }`
- 返回: `object` 显示器信息

### ztools.desktopCaptureSources(options)
获取屏幕/窗口捕获源列表（录屏截图使用）。
- 参数：
  - `options: object`
- 返回: `Promise<object[]>`

### ztools.dipToScreenPoint(point)
DIP 逻辑坐标 → 屏幕物理像素坐标。
- 参数：
  - `point: { x: number, y: number }`
- 返回: `{ x: number, y: number }`

### ztools.screenToDipPoint(point)
屏幕物理像素坐标 → DIP 逻辑坐标。
- 参数：
  - `point: { x: number, y: number }`
- 返回: `{ x: number, y: number }`

### ztools.dipToScreenRect(rect)
DIP 矩形区域 → 物理像素矩形。
- 参数：
  - `rect: { x: number, y: number, width: number, height: number }`
- 返回: `{ x: number, y: number, width: number, height: number }`

## Shell API
### ztools.shellOpenExternal(url)
系统默认浏览器打开网页链接。
- 参数：
  - `url: string`
- 返回: `boolean`

### ztools.shellOpenPath(fullPath)
使用系统默认程序打开文件/文件夹。
- 参数：
  - `fullPath: string` 完整本地路径
- 返回: `boolean`

### ztools.shellShowItemInFolder(fullPath)
文件管理器定位并选中目标文件。
- 参数：
  - `fullPath: string` 文件路径
- 返回: `boolean`

## 其他 API
### ztools.redirect(label, payload)
插件间跳转。
- 参数：
  - `label: string` 目标插件标识
  - `payload: any` 传递数据
- 返回: `boolean`

### ztools.http.setHeaders(headers)
全局设置 HTTP 请求公共请求头。
- 参数：
  - `headers: object`
- 返回: `boolean`

### ztools.http.getHeaders()
读取当前全局请求头。
- 返回: `object`

### ztools.http.clearHeaders()
清空全局 HTTP 请求头配置。
- 返回: `boolean`

## AI API
### ztools.ai(option, streamCallback)
调用内置 AI 模型，支持流式输出与中断请求。
- 参数：
  - `option: object` AI 请求配置，必填 `prompt` 字段
  - `streamCallback?: (chunk: any) => void` 可选，传入则启用流式分段回调
- 返回: `PromiseLike & { abort: () => void }`
  - 非流式：await 直接获取完整返回结果
  - 流式：分段数据通过 streamCallback 推送，await 等待请求结束
  - `.abort()` 手动中断当前 AI 请求

#### 使用示例
```js
// 非流式完整返回
const result = await ztools.ai({ prompt: '你好' })

// 流式逐段接收
const request = ztools.ai({ prompt: '你好' }, (chunk) => {
  console.log('流式分片：', chunk)
})
await request

// 中途终止AI请求
request.abort()
```

### ztools.allAiModels()
获取全部可用 AI 模型列表。
- 返回: `Promise<object[]>`
- 异常：接口获取失败抛出 Error