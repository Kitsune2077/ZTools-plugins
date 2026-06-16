# HushReader

> 隐阅盒 - ZTools 阅读插件，支持 TXT / EPUB 格式，沉浸式阅读

## 功能特性

- 支持 TXT / EPUB 格式书籍
- 沉浸式阅读窗口悬浮于任何位置
- 滚轮翻页、快捷键翻页、自动翻页
- 阅读进度持久化（关闭插件再打开，从上次位置继续）
- 背景透明度与整体透明度分离控制
- 只显示完整行和文字，不会出现文字部分缺失
- 文本预处理：自动压缩空行、处理多余空白字符
- 自定义字体：支持添加系统字体到预设列表
- 编辑元数据：支持修改书籍标题、作者、封面，数据持久化
- 多种排序方式：支持按添加时间、书名、作者排序

## 阅读进度持久化

### 设计思路

阅读进度使用**字符偏移量**（`progressIndex`）而非页码来保存，这样当窗口大小或字体变化导致分页改变时，进度不会丢失。

### 存储策略

优先使用 `ztools.dbStorage`（插件专用数据库），回退到 `localStorage`：

```typescript
function storageGet(key: string): string | null {
  try {
    const zStorage = (window as any).ztools?.dbStorage
    if (zStorage?.getItem) {
      const val = zStorage.getItem(key)
      if (val != null) return typeof val === 'string' ? val : JSON.stringify(val)
    }
  } catch {}
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}
```

### 保存时机

进度在以下时机自动保存：

1. **翻页时** — 每次 prev/next 操作后立即保存
2. **章节切换时** — watch `currentChapterIndex` 变化时保存
3. **自动翻页时** — 每次自动翻页 tick 后保存
4. **插件退出时** — `onPluginOut` 和 `onBeforeUnmount` 中保存

### 保存内容

每本书保存以下字段：

| 字段 | 说明 |
|------|------|
| `lastChapter` | 当前章节索引 |
| `progressIndex` | 当前章节内的字符偏移量 |
| `lastReadAt` | 最后阅读时间戳 |
| `totalChapters` | 总章节数 |

### 恢复流程

打开书籍时：

1. 解析文件获取章节列表
2. 计算沉浸式阅读窗口布局（行长度、行数）
3. 从书籍记录中读取 `lastChapter` 和 `progressIndex`
4. 调用 `goToProgress(chapterIndex, charIndex)` 精确定位

## 连续分页

### 基于字符偏移量的分页

分页系统使用"页面起始索引表"（`pageStarts`）实现连续翻页：

- **下一页**：当前页的 `endIndex` 作为下一页的 `startIndex`
- **上一页**：在 `pageStarts` 中用二分查找定位上一页起始位置
- **跨章节**：下一章从 `progressIndex=0` 开始，上一章跳到末页

### 只显示完整行

沉浸式阅读窗口使用固定行高 + `overflow: hidden` 确保只显示完整行：

```css
.hushreader-lines {
  grid-auto-rows: var(--hushreader-row-height);  /* 固定行高 */
  overflow: hidden;
}

.hushreader-line {
  height: var(--hushreader-row-height);
  min-height: var(--hushreader-row-height);
  overflow: hidden;
}
```

行数通过 `Math.floor(readableHeight / linePx)` 精确计算，不足一行的空间不显示。

## 透明度分离

- **整体透明度**（`opacity`）：控制沉浸式阅读窗口整体的 CSS `opacity`，影响背景和文字
- **背景透明度**（`bgOpacity`）：控制背景色的 alpha 通道，使用 `rgba` 格式

```javascript
// hushreader.html 中将 hex 背景色转为 rgba，bgOpacity 控制 alpha
function setHushreaderColors(bgColor, textColor, bgOpacity) {
  const hex = normalizeHexColor(bgColor, "#1e1f22")
  const rgb = hexToRgb(hex)
  const alpha = bgOpacity / 100
  setCssVar("--hushreader-bg-color", `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`)
}
```

## 文本预处理

为提升阅读体验，在解析 TXT 和 EPUB 文件时自动进行文本预处理：

```typescript
export function preprocessText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')           // 统一换行符为 \n
    .replace(/\r/g, '\n')             // 处理单独的 \r
    .replace(/\t/g, ' ')              // Tab 转空格
    .replace(/ {2,}/g, ' ')           // 多个连续空格压缩为一个
    .replace(/[^\S\n]+/g, ' ')        // 其他空白字符（全角空格等）转为普通空格
    .replace(/\n{3,}/g, '\n\n')       // 三个以上换行压缩为两个（保留段落间隔）
    .replace(/^\n+/, '')              // 移除开头空行
    .replace(/\n+$/, '')              // 移除结尾空行
}
```

### 处理效果
- 多个空行 → 最多保留一个空行（段落间隔）
- Tab、全角空格等 → 转为普通空格
- 连续多个空格 → 压缩为一个空格
- 开头结尾的空行 → 移除

## 自定义字体

### 字体选择器

沉浸式阅读窗口设置中的字体选择器支持：
1. 预设字体：系统默认、衬线体、思源黑体、楷体、仿宋
2. 自定义字体：点击下拉框中的 `+ 添加自定义字体` 选项
3. 字体管理：在"其他设置"中查看和删除已添加的自定义字体

### 持久化存储

自定义字体列表保存在 `config.other.customFonts` 字段中，随配置一起持久化到本地存储。

## 编辑元数据

### 功能说明

右键点击书籍卡片，选择"编辑元数据"，可以修改：
- 书籍标题
- 作者名称
- 封面图片（通过"设置封面"功能）

### 数据持久化

编辑后的元数据通过 `bookStore.updateBook()` 保存到本地存储，关闭插件再打开后仍然保留编辑的数据，不会重新从文件提取。

## 书架排序

书架支持三种排序方式：
- **最近添加**：按书籍添加时间倒序
- **名称**：按书名拼音/字母顺序
- **作者**：按作者名称拼音/字母顺序

## 设置界面优化

### 取消还原功能

设置界面支持：
- 点击"取消"按钮 → 还原到打开设置前的配置
- 点击"保存"按钮 → 保存当前配置并关闭
- 实时预览 → 修改配置时立即看到效果，但未保存前可取消

### 十六进制颜色输入

颜色设置同时支持：
- 颜色选择器（`<input type="color">`）
- 十六进制输入框（如 `#16191c`）
- 两者双向同步

## 项目结构

```
├── public/
│   ├── hushreader.html           # 沉浸式阅读窗口
│   ├── plugin.json            # 插件配置
│   ├── logo.png               # 插件图标
│   └── preload/
│       ├── package.json
│       └── services.js        # Node.js 能力扩展
├── src/
│   ├── App.vue                # 根组件（沉浸式阅读窗口管理、进度保存）
│   ├── main.ts                # 应用入口
│   ├── main.css               # 全局样式
│   ├── env.d.ts               # TypeScript 类型声明
│   ├── stores/
│   │   ├── books.ts           # 书籍数据 + 持久化存储
│   │   ├── config.ts          # 配置数据 + 持久化存储
│   │   └── reader.ts          # 阅读器状态（基于字符偏移量分页）
│   ├── utils/
│   │   ├── txtParser.ts       # TXT 解析 + 分页算法 + 文本预处理
│   │   └── epubParser.ts      # EPUB 解析
│   └── components/
│       ├── Bookshelf/         # 书架组件
│       │   ├── index.vue      # 书架主组件
│       │   ├── BookCard.vue   # 书籍卡片
│       │   ├── ContextMenu.vue # 右键菜单
│       │   ├── Modal.vue      # 模态框
│       │   └── Toast.vue      # 提示消息
│       └── Settings/          # 设置面板
│           └── index.vue      # 设置界面
├── .gitignore
├── README.md
├── package.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

## 开发

```bash
npm install
npm run dev
npm run build
```

## 开源协议

MIT License
