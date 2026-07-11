# Changelog

## [1.0.0] - 2026-07-11

### 🐛 Bug Fixes

- **ComposeView 滚动修复** — 左侧提示词列表无法上下滑动，为 `.compose-body` 添加 `grid-template-rows: 1fr` 约束网格行高
- **精确重复检测修复** — `detectDuplicate` 中 `(e as any).hash` 永远为 `undefined`，改为直接字符串比对 `e.content === newContent`
- **版本号不一致** — `SettingsView.vue` 显示 `v2.0.0`，与 `package.json` 的 `1.0.0` 不一致，已统一
- **README 视图名不一致** — 项目结构中 `CallView.vue`、`LibraryView.vue` 与实际代码不符，已更正为 `SpaceView.vue`、`ManageView.vue`
- **saveEdit 快照空值崩溃** — `u.snapshots` 为 `undefined` 时调用 `.push()` 抛出 `TypeError`，添加空值容错处理

### ⚡ Performance

- **批量删除优化** — `ManageView.batchDelete` 从循环内逐条调用 `softDelete`（每次触发 `persistAll`）改为内存批量标记后统一持久化，数据库写入从 N 次降为 1 次
- **批量移动项目优化** — `ManageView` 的 `@change` 内联处理器提取为 `batchMoveProject` 函数，批量更新 `projectId` 后仅调用一次 `persistAll()`
- **删除项目优化** — `SpaceView.deleteProject` 从循环内逐条调用 `updateItem` 改为内存批量修改后统一持久化
- **导入词库优化** — `SettingsView.importJson` 从循环内逐条调用 `addItem`（每次触发 `persistAll`）改为内存批量 `push` 后统一持久化

### 🎨 Design

- **新图标** — 生成"词匠"专属图标（铁砧 + 锤子 + 金色火花 + `{{词}}` 变量符号），替换默认占位图标

### 🗑️ Removed

- 移除未使用的 `fnvHash` 函数（精确重复检测改为字符串比对后不再需要）
