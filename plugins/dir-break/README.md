# 解散文件夹

> 将文件夹内的所有文件释放到上一层目录，一键解散空文件夹。

使用 **Vue 3 + TypeScript + Vite** 构建的 ZTools 插件。

## 功能特性

- **释放文件** - 将文件夹内的文件移动到上一级目录
- **单层模式** - 仅处理直接文件，保留子目录结构
- **递归模式** - 提取所有层级的文件，清空并删除子目录
- **冲突处理** - 自动重命名 / 覆盖 / 跳过三种策略
- **撤回操作** - 一键将文件原路移回，重建目录结构
- **历史记录** - 持久化保存最近 50 条操作记录

## 使用方式

1. 在 ZTools 中输入 `解散文件夹` 打开插件
2. 直接拖入文件夹到插件窗口
3. 点击「选择文件夹」按钮选取目录

## 项目结构

```
.
├── public/
│   ├── logo.png              # 插件图标
│   ├── plugin.json           # 插件配置文件
│   └── preload/
│       ├── package.json
│       └── services.js       # Node.js 文件操作服务
├── src/
│   ├── main.ts
│   ├── main.css              # 全局样式（含暗色主题）
│   ├── App.vue               # 根组件
│   ├── env.d.ts              # 类型声明
│   ├── types.ts              # TypeScript 类型定义
│   └── Break/
│       └── index.vue         # 核心解散组件
├── index.html
├── vite.config.js
├── tsconfig.json
├── package.json
└── 开发方案.md
```

## 开发

```bash
npm install
npm run dev    # 开发模式 http://localhost:5173
npm run build  # 构建到 dist/
```

## 协议

MIT
