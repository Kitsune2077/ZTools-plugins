import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export interface HushreaderConfig {
  hushreaderWidth: number
  hushreaderHeight: number
  hushreaderX: number
  hushreaderY: number
  hideOnMouseLeave: 'off' | 'show-progress' | 'hide-all'
  mouseEnterDelay: number
  showHushreaderMeta: boolean
  wheelTurnPage: boolean
  prevPageKey: string
  nextPageKey: string
  opacity: number
  bgOpacity: number
  bgColor: string
  textColor: string
  fontSize: number
  fontFamily: string
  lineHeight: number
  letterSpacing: number
  autoFlipEnabled: boolean
  autoFlipInterval: number
  continuousFlip: boolean
  progressMode: 'chapter' | 'percent'
}

export interface AppearanceConfig {
  fontSize: number
  fontFamily: string
  lineHeight: number
  letterSpacing: number
  textColor: string
  bgColor: string
  bgOpacity: number
  windowWidth: number
  windowHeight: number
}

export interface FunctionConfig {
  pageMode: 'adaptive' | 'fixed'
  pageLines: number
  scrollWheelEnabled: boolean
  scrollWheelDelay: number
  nextPageKeys: string[]
  prevPageKeys: string[]
  nextChapterKeys: string[]
  prevChapterKeys: string[]
  autoFlipEnabled: boolean
  autoFlipInterval: number
  mouseHideEnabled: boolean
  windowMovable: boolean
}

export interface OtherConfig {
  configName: string
  plainTextCover: boolean
  listMode: boolean
  chapterRegex: string
  customFonts: string[]
}

export interface ReaderConfig {
  hushreader: HushreaderConfig
  function: FunctionConfig
  other: OtherConfig
  appearance: AppearanceConfig
}

const DEFAULT_CONFIG: ReaderConfig = {
  hushreader: {
    hushreaderWidth: 700,
    hushreaderHeight: 100,
    hushreaderX: 0,
    hushreaderY: 0,
    hideOnMouseLeave: 'hide-all',
    mouseEnterDelay: 0,
    showHushreaderMeta: true,
    wheelTurnPage: true,
    prevPageKey: 'ArrowLeft',
    nextPageKey: 'ArrowRight',
    opacity: 82,
    bgOpacity: 100,
    bgColor: '#1e1f22',
    textColor: '#cccccc',
    fontSize: 16,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    lineHeight: 1.8,
    letterSpacing: 0,
    autoFlipEnabled: false,
    autoFlipInterval: 5000,
    continuousFlip: false,
    progressMode: 'percent'
  },
  function: {
    pageMode: 'adaptive',
    pageLines: 5,
    scrollWheelEnabled: true,
    scrollWheelDelay: 300,
    nextPageKeys: ['ArrowRight', 'PageDown'],
    prevPageKeys: ['ArrowLeft', 'PageUp'],
    nextChapterKeys: ['Ctrl+ArrowRight'],
    prevChapterKeys: ['Ctrl+ArrowLeft'],
    autoFlipEnabled: false,
    autoFlipInterval: 5000,
    mouseHideEnabled: true,
    windowMovable: true
  },
  other: {
    configName: '配置',
    plainTextCover: false,
    listMode: false,
    chapterRegex: '',
    customFonts: []
  },
  appearance: {
    fontSize: 16,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    lineHeight: 1.8,
    letterSpacing: 0,
    textColor: '#333333',
    bgColor: '#ffffff',
    bgOpacity: 1,
    windowWidth: 700,
    windowHeight: 500
  }
}

function storageGet(key: string): string | null {
  try {
    const zStorage = (window as any).ztools?.dbStorage
    if (zStorage?.getItem) {
      const val = zStorage.getItem(key)
      if (val != null) return typeof val === 'string' ? val : JSON.stringify(val)
    }
  } catch { }
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function storageSet(key: string, value: string) {
  try {
    const zStorage = (window as any).ztools?.dbStorage
    if (zStorage?.setItem) {
      zStorage.setItem(key, value)
      return
    }
  } catch { }
  try {
    window.localStorage.setItem(key, value)
  } catch { }
}

export const useConfigStore = defineStore('config', () => {
  const config = ref<ReaderConfig>(structuredClone(DEFAULT_CONFIG))

  function load() {
    const data = storageGet('hushreader_config')
    if (data) {
      try {
        const saved = JSON.parse(data)
        if (saved?.hushreader?.hideOnMouseLeave === true) {
          saved.hushreader.hideOnMouseLeave = 'hide-all'
        } else if (saved?.hushreader?.hideOnMouseLeave === false) {
          saved.hushreader.hideOnMouseLeave = 'off'
        }
        config.value = deepMerge(structuredClone(DEFAULT_CONFIG), saved)
      } catch { }
    }
  }

  function save() {
    storageSet('hushreader_config', JSON.stringify(config.value))
  }

  function resetToDefault() {
    config.value = structuredClone(DEFAULT_CONFIG)
    save()
  }

  return { config, load, save, resetToDefault, DEFAULT_CONFIG }
})

function deepMerge(target: any, source: any): any {
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key]) target[key] = {}
      deepMerge(target[key], source[key])
    } else {
      target[key] = source[key]
    }
  }
  return target
}
