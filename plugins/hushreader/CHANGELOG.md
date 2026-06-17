# Changelog

All notable changes to this project will be documented in this file.

## [1.3.1](https://github.com/me1dlinger/hushreader/releases/tag/v1.3.1) - 2026-06-17

### Added
- **窗口大小锁定开关**：功能设置中新增"窗口大小锁定"开关，开启后窗口不允许拉伸调整大小

### Fixed
- **窗口可拖动开关生效**：修复关闭"窗口可拖动"后窗口仍可拖动的问题，关闭后拖动区域 cursor 变为 default

### Removed
- **固定行数分页模式**：移除分页模式中的"固定行数"选项，统一使用自适应模式


## [1.3.0](https://github.com/me1dlinger/hushreader/releases/tag/v1.3.0) - 2026-06-17

### Added
- **MOBI 格式支持**：新增 MOBI 电子书格式的解析和阅读功能
- **主题模式切换**：新增"主题模式"切换

### Changed
- **封面和章节内容缓存迁移至 ztools.db 数据库**：封面和章节内容不再每次实时解析，改为存到 ztools.db 数据库，提升书架加载和打开书籍的速度
  - 封面图（coverImage/customCoverImage）存入数据库文档 `cover_{bookId}` / `custom_cover_{bookId}`，书架加载时从数据库恢复
  - 章节内容存入数据库文档 `chapters_{bookId}`，打开书籍时优先从数据库加载，文件修改后自动重新解析并更新缓存
  - 删除书籍时同步清理数据库中对应的封面和章节文档
  - 开启"显示纯色封面"时清除数据库中的封面数据
  - dbStorage 中仅保留轻量数据：书籍列表（不含封面）、阅读进度、配置

## [1.2.0](https://github.com/me1dlinger/hushreader/releases/tag/v1.2.0) - 2026-06-16

### Fixed
- **移除大体积缓存，改为实时解析**：EPUB 封面和章节内容不再持久化到 dbStorage，改为每次需要时从文件实时解析，彻底解决存储空间溢出导致书籍丢失的问题
  - 封面图（coverImage/customCoverImage）仅在内存中保留，不写入存储；书架加载时异步从 EPUB 文件解析封面
  - 章节内容不再缓存到 `hushreader_chapters_*`，每次打开书籍时实时解析
  - 移除 `hushreader_cover_*` / `hushreader_custom_cover_*` / `hushreader_chapters_*` 等存储 key 的读写
  - dbStorage 中仅保留轻量数据：书籍列表（不含封面）、阅读进度、配置

### Added
- **显示纯色封面选项**：其他设置中新增"显示纯色封面"开关，开启后 EPUB 不再解析封面图片，所有书籍使用纯色背景封面，节省性能消耗

## [1.1.1](https://github.com/me1dlinger/hushreader/releases/tag/v1.1.1) - 2026-06-16

### Fixed
- **窗口拖动/拉伸卡顿**：修复移动和拉伸阅读窗口时严重卡顿的问题——移动预览未做帧节流、预览期间重复调用 `setAlwaysOnTop`/`moveTop` 等重操作、提交时重复推送状态

## [1.1.0](https://github.com/me1dlinger/hushreader/releases/tag/v1.1.0) - 2026-06-16

### Fixed
- **设置编辑触发主窗口隐藏**：修复在设置界面编辑背景颜色输入框或快捷键时，每次输入/删除字符都会触发沉浸式阅读窗口 `show()`，导致主窗口被推到后面的问题
- **重复 click 事件监听器**：移除 hushreader.html 中重复的 `document.click` 监听器，避免上下文菜单关闭逻辑被执行两次
- **jump-percent 命令类型错误**：将 `jump-percent` 命令处理从字符串分支移至对象分支，修复 TypeScript 类型收窄导致的编译错误
- **TXT 目录误解析**：自动检测并跳过文件开头的目录区域，避免目录中的章节标题被误解析为章节分割点，导致跳转只在目录内跳转
- **自动翻页主窗口隐藏**：修复自动翻页时沉浸式阅读窗口重复调用 `show()` 抢夺焦点，导致主窗口被隐藏无法操作的问题
- **百分比进度精度**：阅读百分比从整数改为精确到小数点后两位（如 11.45%）
- **字体设置不生效**：修复字体选择和自定义字体在沉浸式阅读窗口中不生效的问题——`fontFamily` 未传递至阅读窗口且阅读窗口使用硬编码字体
- **删除书籍数据残留**：修复删除书籍后未清除 `dbStorage` 中对应章节缓存数据的问题


### Changed
- **章节列表高亮当前进度**：打开章节列表时自动高亮当前阅读进度所在章节，并滚动到该章节位置
- **书籍右键菜单位置**：书籍卡片右键菜单不再跟随鼠标，固定显示

### Added
- **鼠标移出隐藏三模式**：鼠标移出隐藏从布尔开关扩展为下拉三选一——不隐藏 / 快速隐藏但显示进度 / 快速隐藏且不显示进度
- **鼠标移入显示延迟**：开启快速隐藏后，可设置鼠标移入后延迟多少秒才显示阅读窗口（0-10秒）
- **沉浸式阅读窗口右键菜单**：在进度显示组件上右键可弹出菜单，支持关闭阅读窗口、显示主窗口、停止/开启自动翻页
- **百分比进度编辑跳转**：百分比进度模式下，左键点击进度组件进入编辑模式，输入 0-100 数字后按 Enter 或点击外部区域跳转到对应进度，支持 ArrowUp/Down 微调（Shift 步进 10），Escape 取消
- **书架"最近阅读"排序**：书架排序栏新增"最近阅读"选项，按最后阅读时间降序排列，未读过的书排在最后

## [1.0.0](https://github.com/me1dlinger/hushreader/releases/tag/v1.0.0) - 2026-06-16

### Added
- **隐阅盒阅读器插件**：隐阅盒阅读器插件初版实现

