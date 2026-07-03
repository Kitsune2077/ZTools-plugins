# Serious Reading

> 一款对待摸鱼阅读很严肃的阅读插件

Serious Reading 是 [ZTools](https://github.com/ZToolsCenter/ZTools) 平台上的本地阅读器插件，支持 TXT / EPUB / PDF 三种格式。专为「在工作间隙低调阅读」设计——悬浮透明阅读窗、老板键伪装隐藏、自动翻页、全屏取色配色，让你严肃地摸鱼。

## 核心特性

### 阅读体验

- **三格式支持** — TXT（自动编码检测 BOM/jschardet/GBK fallback）、EPUB（adm-zip 解析章节 + 封面提取）、PDF（pdfjs-dist canvas 渲染）
- **书架管理** — 网格书架，EPUB 显示封面缩略图，TXT/PDF 显示书名色块；支持进度百分比展示、最近阅读历史
- **章节跳转** — 右键菜单打开章节列表，支持标题搜索过滤
- **全文搜索** — TXT 全文字符流搜索，关键字上下文高亮，分页加载更多，点击直接跳转到对应章节和位置
- **百分比跳转** — 阅读窗右下角输入百分比，精确跳转到全书对应位置
- **高度测量分页** — 按实际渲染高度自动分页，字号/行高/窗口尺寸变化时自动重排
- **阅读进度记忆** — 自动保存每本书的章节、页码、字符偏移，下次打开恢复到上次位置

### 摸鱼伪装

- **透明留窗（Stealth）** — 阅读窗变为 `#00000001` 近全透明状态，窗口仍在但内容不可见，鼠标移回即可恢复
- **真隐藏** — `win.hide()` 彻底消失，通过 ZTools 命令或全局快捷键恢复
- **三功能触发器自定义** — 隐身切换 / 显示 / 真隐藏三个功能可分别绑定触发动作（双击、中键、右键、Esc、鼠标离开边缘、鼠标进入边缘），系统实时检测冲突
- **自动翻页暂停** — Stealth 隐藏时可配置自动暂停翻页

| 功能 | 默认触发 | 含义 |
|------|----------|------|
| 隐身（显→隐） | Esc / 双击 / 鼠标离开边缘 | 内容透明化，窗口保留 |
| 显示（隐→显） | 中键 | 恢复内容可见 |
| 真隐藏 | 右键 | 窗口彻底消失，命令恢复 |

### 阅读窗操作

- **原地拖拽移动** — 鼠标按住中间区域拖动，通过 IPC 调用 `win.setPosition` 实现（不使用 drag region，避免吞掉右键/中键事件）
- **边缘缩放** — 四边 + 四角缩放把手，纯 JS 实现
- **窗口位置记忆** — 自动保存阅读窗位置和尺寸
- **翻页方式可配置** — 键盘 ←→ / 滚轮 / 点击左右 / PageUp Down / 空格 / 触摸滑动，可任意组合开关
- **翻页过渡动画** — 无动画 / 滑动两种模式

### 外观定制

- **明暗主题** — 跟随系统 / 手动明亮 / 手动暗黑
- **阅读配色** — 背景色、文字色自定义，支持**全屏截图取色**（调用 ZTools screenCapture）
- **排版控制** — 字号（8-32px）、行高（1.0-3.0）、字重（50-1000）、字体选择（11 种中英文字体）、透明度（10%-100%）、清理空行
- **设置实时生效** — 修改设置后自动推送到已打开的阅读窗，无需重新打开

## 技术栈

| 层 | 技术 |
|----|------|
| 平台 | ZTools（Electron） |
| UI | React 18 + TypeScript + Vite（双入口：主窗 `index.html` / 悬浮阅读窗 `reader.html`） |
| 样式 | Tailwind CSS + shadcn/ui（Radix Primitives） |
| PDF | pdfjs-dist（前端 canvas 渲染） |
| TXT 编码 | BOM 检测 + jschardet + iconv-lite（preload 层，不编译） |
| EPUB | adm-zip 解析（提取章节 + 封面） |
| 存储 | `ztools.dbStorage`（键值对）+ `ztools.db`（书架文档 / 封面附件） |

## 架构

```
主窗 (index.html)                    阅读窗 (reader.html)
  ├─ 书架网格                           ├─ 分页渲染（高度测量）
  ├─ 设置面板                           ├─ Stealth 透明伪装
  ├─ 章节跳转 Dialog                    ├─ PDF canvas 渲染
  ├─ 全文搜索 Dialog                    ├─ 纯 JS 窗口拖拽/缩放
  ├─ 最近阅读历史                       ├─ 自动翻页
  └─ preload/main.js                   └─ preload/reader.js
       ├─ 文件读取/解码                      ├─ 文件读取/解码
       ├─ EPUB 解析                          └─ IPC 回传（进度/隐藏/窗口操作）
       ├─ 阅读窗 BrowserWindow 管理
       └─ IPC 转发（真隐藏/窗口移动）
```

阅读窗自闭环设计：翻页、切章、存进度直接调用 preload 读取文件，不回主窗中转。仅真隐藏和窗口位置保存需经 IPC 回主窗。

## 目录结构

```
serious-reading-zt/
├── plugin.json          # ZTools 插件配置
├── index.html           # 主窗入口（书架/设置）
├── reader.html          # 悬浮阅读窗入口
├── logo.svg             # 插件 Logo
├── preload/             # 不编译的 CommonJS（+ node_modules）
│   ├── main.js          # 主窗 preload（文件读取/EPUB解析/阅读窗管理）
│   ├── reader.js        # 阅读窗 preload（文件读取/IPC 回传）
│   └── package.json     # adm-zip / iconv-lite / jschardet
├── src/
│   ├── main/            # 主窗 React
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── theme.ts
│   │   └── components/  # BookCard / SettingsDialog / ChapterDialog / SearchDialog
│   ├── reader/          # 阅读窗 React
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── usePagination.ts
│   │   └── components/  # PdfView
│   ├── shared/          # 共享模块
│   │   ├── types.ts     # 类型定义
│   │   ├── constants.ts # 默认设置/触发器选项/字体列表
│   │   ├── parser.ts    # TXT/EPUB/PDF 解析 + 全文搜索 + HTML 渲染
│   │   ├── storage.ts   # 书架/进度/设置/封面的存储读写
│   │   ├── ipc.ts       # IPC 通道常量
│   │   └── ztools.d.ts  # ZTools API 类型声明
│   ├── components/ui/   # shadcn/ui 基础组件
│   └── styles/globals.css
├── vite.config.ts       # 双入口构建 + logo 拷贝
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

## 开发

```bash
# 1. 安装前端依赖
npm install

# 2. 安装 preload 原生依赖（不编译，随源码提交）
cd preload && npm install && cd ..

# 3. 开发模式（Vite dev server :5173，ZTools 开发者工具以本目录为根加载）
npm run dev

# 4. 构建产物到 dist/
npm run build
```

构建后 `dist/` 包含 `index.html`、`reader.html` 及打包的 assets，preload 目录保持原样不参与编译。

## 打包发布

```bash
# 安装 ZTools 插件 CLI
npm install -g @ztools-center/plugin-cli

# 初始化 Git 并提交
git init && git add . && git commit -m "Initial commit"

# 发布到 ZTools 插件中心
ztools publish
```

> **注意**：preload 依赖（`iconv-lite`、`adm-zip`、`jschardet`）必须原样放在 `preload/node_modules/` 且不要压缩/混淆；ZTools 要求 preload 代码清晰可读。

## 触发命令

| 命令 | 说明 |
|------|------|
| `阅读` / `书架` / `serious` | 打开阅读器书架 |
| `继续阅读` | 继续上次阅读 |
| `显示阅读器` / `show` | 显示阅读窗 |
| `切换阅读器` / `toggle` | 切换阅读窗显隐 |
| 拖入 TXT/EPUB/PDF 文件 | 直接打开阅读 |
