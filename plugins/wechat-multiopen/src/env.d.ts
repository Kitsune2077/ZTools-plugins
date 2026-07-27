/// <reference types="vite/client" />
/// <reference types="@ztools-center/ztools-api-types" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}

interface WeChatMultiOpenConfig {
  wechatPath?: string
  count?: number
}

interface WeChatLaunchResult {
  wechatPath: string
  count: number
}

interface Services {
  defaultPaths: string[]
  findWeChatPath: () => string
  getLogFilePath: () => string
  getWeChatProcessCount: () => number
  isFile: (filePath: string) => boolean
  launchWeChat: (count: number, customPath?: string) => WeChatLaunchResult
  log: (message: string, data?: unknown) => void
  notify: (message: string) => void
  pickWeChatPath: () => string
  readConfig: () => WeChatMultiOpenConfig
  resolveWeChatPath: (inputPath?: string) => string
  saveConfig: (config: WeChatMultiOpenConfig) => WeChatMultiOpenConfig
}

declare global {
  interface Window {
    services: Services
  }
}

export {}
