<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import Bookshelf from './components/Bookshelf/index.vue'
import { useReaderStore } from './stores/reader'
import { useBookStore } from './stores/books'
import { useConfigStore } from './stores/config'
import { parseTxt } from './utils/txtParser'
import { parseEpub } from './utils/epubParser'

type HushreaderCommand = string | { type?: string; width?: number; height?: number; x?: number; y?: number }
type HushreaderBounds = { x: number; y: number; width: number; height: number }
type AppBrowserWindow = {
  id: number
  show?: () => void
  hide?: () => void
  close?: () => void
  focus?: () => void
  blur?: () => void
  isDestroyed?: () => boolean
  setFocusable?: (flag: boolean) => void
  setSkipTaskbar?: (flag: boolean) => void
  setSize?: (width: number, height: number) => void
  setContentSize?: (width: number, height: number) => void
  setContentBounds?: (bounds: HushreaderBounds) => void
  setPosition?: (x: number, y: number) => void
  setAlwaysOnTop?: (flag: boolean) => void
  moveTop?: () => void
  webContents?: {
    executeJavaScript?: <T = unknown>(code: string, userGesture?: boolean) => Promise<T>
  }
}

const FISH_MIN_WIDTH = 280
const FISH_MAX_WIDTH = 1180
const FISH_MIN_HEIGHT = 22
const FISH_MAX_HEIGHT = 160
const FISH_META_ROW_HEIGHT = 18
const FISH_SIDE_CONTROLS_WIDTH = 44
const FISH_CONTENT_PADDING = 20

const route = ref('')
const enterAction = ref<any>({})

const readerStore = useReaderStore()
const bookStore = useBookStore()
const configStore = useConfigStore()

const isReaderHidden = ref(false)
const isAutoPaging = ref(false)
const isHushreaderKeyboardActive = ref(false)
const hushreaderActivated = ref(false)
let autoTimer = 0
let isAutoPageTickRunning = false

let hushreaderWindow: AppBrowserWindow | null = null
let hushreaderWindowAnchor: { x: number; y: number } | null = null
let offHushreaderCommand: (() => void) | undefined

const cfg = computed(() => configStore.config)
const hushreaderCfg = computed(() => cfg.value.hushreader)

const currentBook = computed(() => {
  const id = bookStore.currentBookId
  return id ? bookStore.books.find(b => b.id === id) ?? null : null
})

const currentChapter = computed(() =>
  readerStore.chapters[readerStore.currentChapterIndex] ?? null
)

const hushreaderLines = computed(() => readerStore.hushreaderLines)

const progressLabel = computed(() => {
  if (hushreaderCfg.value.progressMode === 'percent') {
    return `${readerStore.readingPercent}%`
  }
  const total = readerStore.chapters.length
  const ci = readerStore.currentChapterIndex
  return total > 0 ? `${ci + 1}/${total}` : ''
})

const activeBookLabel = computed(() => currentBook.value?.title ?? '')

function clampNumber(value: number, min: number, max: number) {
  const safeMin = Number.isFinite(min) ? min : 0
  const safeMax = Number.isFinite(max) ? Math.max(safeMin, max) : safeMin
  const safeValue = Number.isFinite(value) ? value : safeMin
  return Math.min(safeMax, Math.max(safeMin, Math.round(safeValue)))
}

function getWorkArea() {
  const display = (window as any).ztools?.getPrimaryDisplay?.()
  return display?.workArea ?? { x: 0, y: 0, width: window.screen.availWidth, height: window.screen.availHeight }
}

function getHushreaderSizeLimits() {
  const area = getWorkArea()
  return {
    minWidth: FISH_MIN_WIDTH,
    maxWidth: Math.max(FISH_MIN_WIDTH, Math.min(area.width, FISH_MAX_WIDTH)),
    minHeight: FISH_MIN_HEIGHT,
    maxHeight: Math.max(FISH_MIN_HEIGHT, Math.min(area.height, FISH_MAX_HEIGHT))
  }
}

function clampHushreaderSize(width: number, height: number) {
  const limits = getHushreaderSizeLimits()
  return {
    width: clampNumber(width, limits.minWidth, limits.maxWidth),
    height: clampNumber(height, limits.minHeight, limits.maxHeight)
  }
}

function getInitialHushreaderWindowBoundsForSize(width: number, height: number) {
  const area = getWorkArea()
  const size = clampHushreaderSize(width, height)
  return {
    ...size,
    x: Math.round(area.x + (area.width - size.width) / 2),
    y: Math.round(area.y + area.height - size.height)
  }
}

function getStoredHushreaderAnchor() {
  const fc = hushreaderCfg.value
  if (Number.isFinite(fc.hushreaderX) && Number.isFinite(fc.hushreaderY) && (fc.hushreaderX !== 0 || fc.hushreaderY !== 0)) {
    return { x: fc.hushreaderX, y: fc.hushreaderY }
  }
  return null
}

function getAnchoredHushreaderWindowBoundsForSize(width: number, height: number) {
  const area = getWorkArea()
  const size = clampHushreaderSize(width, height)
  const fallback = hushreaderWindowAnchor ?? getStoredHushreaderAnchor() ?? getInitialHushreaderWindowBoundsForSize(size.width, size.height)
  const maxX = area.x + Math.max(0, area.width - size.width)
  const maxY = area.y + Math.max(0, area.height - size.height)
  return {
    ...size,
    x: clampNumber(fallback.x, area.x, maxX),
    y: clampNumber(fallback.y, area.y, maxY)
  }
}

function getMovedHushreaderWindowBounds(x: number, y: number) {
  const area = getWorkArea()
  const size = clampHushreaderSize(hushreaderCfg.value.hushreaderWidth, hushreaderCfg.value.hushreaderHeight)
  const maxX = area.x + Math.max(0, area.width - size.width)
  const maxY = area.y + Math.max(0, area.height - size.height)
  return {
    ...size,
    x: clampNumber(x, area.x, maxX),
    y: clampNumber(y, area.y, maxY)
  }
}

function getHushreaderWindowBounds() {
  return getAnchoredHushreaderWindowBoundsForSize(hushreaderCfg.value.hushreaderWidth, hushreaderCfg.value.hushreaderHeight)
}

function getHushreaderLineLength(): number {
  const readableWidth = Math.max(24, hushreaderCfg.value.hushreaderWidth - FISH_SIDE_CONTROLS_WIDTH - FISH_CONTENT_PADDING)
  const cjkCharWidth = Math.max(1, hushreaderCfg.value.fontSize + hushreaderCfg.value.letterSpacing)
  return Math.max(1, Math.floor(readableWidth / cjkCharWidth))
}

function getHushreaderLineCount(): number {
  const linePx = hushreaderCfg.value.fontSize * hushreaderCfg.value.lineHeight
  const reservedHeight = hushreaderCfg.value.showHushreaderMeta ? FISH_META_ROW_HEIGHT : 0
  const readableHeight = Math.max(18, hushreaderCfg.value.hushreaderHeight - 6 - reservedHeight)
  return Math.max(1, Math.floor(readableHeight / Math.max(12, linePx)))
}

function updateHushreaderLayout() {
  readerStore.setHushreaderLayout(getHushreaderLineLength(), getHushreaderLineCount())
}

function getHushreaderPayload(bounds = getHushreaderWindowBounds()) {
  return {
    visible: hushreaderActivated.value && Boolean(currentBook.value) && readerStore.chapters.length > 0 && !isReaderHidden.value,
    title: activeBookLabel.value,
    chapter: currentChapter.value?.title ?? '',
    progress: progressLabel.value,
    readingPercent: readerStore.readingPercent,
    currentPage: readerStore.currentPage + 1,
    pageCount: readerStore.totalPages,
    lines: hushreaderLines.value,
    bounds,
    resizeLimits: getHushreaderSizeLimits(),
    settings: {
      fontSize: hushreaderCfg.value.fontSize,
      lineHeight: hushreaderCfg.value.lineHeight,
      hushreaderWidth: hushreaderCfg.value.hushreaderWidth,
      hushreaderHeight: hushreaderCfg.value.hushreaderHeight,
      hushreaderX: hushreaderCfg.value.hushreaderX,
      hushreaderY: hushreaderCfg.value.hushreaderY,
      letterSpacing: hushreaderCfg.value.letterSpacing,
      opacity: hushreaderCfg.value.opacity,
      bgOpacity: hushreaderCfg.value.bgOpacity,
      prevPageKey: hushreaderCfg.value.prevPageKey,
      nextPageKey: hushreaderCfg.value.nextPageKey,
      showHushreaderMeta: hushreaderCfg.value.showHushreaderMeta,
      progressMode: hushreaderCfg.value.progressMode,
      hideOnMouseLeave: hushreaderCfg.value.hideOnMouseLeave,
      wheelTurnPage: hushreaderCfg.value.wheelTurnPage,
      bgColor: hushreaderCfg.value.bgColor,
      textColor: hushreaderCfg.value.textColor
    }
  }
}

function applyHushreaderWindowBounds(bounds: HushreaderBounds) {
  if (!hushreaderWindow || hushreaderWindow.isDestroyed?.()) return
  hushreaderWindowAnchor = { x: bounds.x, y: bounds.y }
  hushreaderWindow.setContentBounds?.(bounds)
  hushreaderWindow.setContentSize?.(bounds.width, bounds.height)
  hushreaderWindow.setSize?.(bounds.width, bounds.height)
  hushreaderWindow.setPosition?.(bounds.x, bounds.y)
  hushreaderWindow.setAlwaysOnTop?.(true)
  hushreaderWindow.setSkipTaskbar?.(true)
  hushreaderWindow.moveTop?.()
}

function positionHushreaderWindow() {
  applyHushreaderWindowBounds(getHushreaderWindowBounds())
}

function pushHushreaderState() {
  if (!hushreaderWindow || hushreaderWindow.isDestroyed?.()) return
  const bounds = getHushreaderWindowBounds()
  const payload = getHushreaderPayload(bounds)
  if (payload.visible) {
    applyHushreaderWindowBounds(bounds)
    hushreaderWindow.show?.()
  } else {
    hushreaderWindow.hide?.()
  }
  const sync = hushreaderWindow.webContents?.executeJavaScript?.(
    `window.hushreaderSetState?.(${JSON.stringify(payload)})`
  )
  void sync?.catch((error) => {
    console.warn('[HushReader] hushreader window sync failed', error)
  })
}

function ensureHushreaderWindow() {
  if (!hushreaderActivated.value || !(window as any).ztools?.createBrowserWindow || !currentBook.value) return
  if (hushreaderWindow && !hushreaderWindow.isDestroyed?.()) {
    pushHushreaderState()
    return
  }
  const bounds = getHushreaderWindowBounds()
  hushreaderWindowAnchor = { x: bounds.x, y: bounds.y }
  hushreaderWindow = (window as any).ztools.createBrowserWindow(
    'hushreader.html',
    {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      show: false,
      title: '隐阅盒',
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      skipTaskBar: true,
      showInTaskbar: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      focusable: true,
      acceptFirstMouse: true,
      alwayOnTop: true,
      alwaysOnTop: true,
      webPreferences: {
        devTools: false,
        zoomFactor: 1,
        nodeIntegration: false,
        contextIsolation: false
      }
    },
    () => pushHushreaderState()
  )
  pushHushreaderState()
}

function showHushreaderWindow() {
  if (!hushreaderActivated.value) return
  isReaderHidden.value = false
  ensureHushreaderWindow()
  nextTick(pushHushreaderState)
}

function hideHushreaderWindow() {
  isReaderHidden.value = true
  blurHushreaderKeyboard()
}

function focusHushreaderKeyboard() {
  isHushreaderKeyboardActive.value = true
  if (!hushreaderWindow || hushreaderWindow.isDestroyed?.()) return
  hushreaderWindow.setSkipTaskbar?.(true)
  hushreaderWindow.setAlwaysOnTop?.(true)
  hushreaderWindow.moveTop?.()
}

function blurHushreaderKeyboard() {
  isHushreaderKeyboardActive.value = false
  if (!hushreaderWindow || hushreaderWindow.isDestroyed?.()) return
  hushreaderWindow.setSkipTaskbar?.(true)
}

function toggleHidden() {
  isReaderHidden.value = !isReaderHidden.value
  if (isReaderHidden.value) blurHushreaderKeyboard()
}

function toggleAutoPaging() {
  if (!currentBook.value) return
  isAutoPaging.value = !isAutoPaging.value
  hushreaderCfg.value.autoFlipEnabled = isAutoPaging.value
}

function closePlugin() {
  isReaderHidden.value = true
  hushreaderActivated.value = false
  try { (window as any).ztools?.outPlugin?.() } catch {}
}

function saveReadingProgress() {
  const book = bookStore.currentBook
  if (!book) return
  bookStore.updateBook(book.id, {
    lastChapter: readerStore.currentChapterIndex,
    progressIndex: readerStore.progressIndex,
    lastReadAt: Date.now(),
    totalChapters: readerStore.chapters.length,
    readingPercent: readerStore.readingPercent
  })
}

function getChapterCacheKey(bookId: string): string {
  return `hushreader_chapters_${bookId}`
}

function getFileModifiedTime(filePath: string): number | null {
  try {
    return (window as any).services?.getFileModifiedTime?.(filePath) ?? null
  } catch {
    return null
  }
}

async function loadChaptersFromCache(bookId: string): Promise<any[] | null> {
  try {
    const zStorage = (window as any).ztools?.dbStorage
    const storage = zStorage?.getItem ? zStorage : window.localStorage
    const data = storage.getItem(getChapterCacheKey(bookId))
    if (!data) return null
    return JSON.parse(data)
  } catch {
    return null
  }
}

async function saveChaptersToCache(bookId: string, chapters: any[]) {
  try {
    const zStorage = (window as any).ztools?.dbStorage
    const storage = zStorage?.setItem ? zStorage : window.localStorage
    storage.setItem(getChapterCacheKey(bookId), JSON.stringify(chapters))
  } catch {
    console.warn('Failed to save chapters cache')
  }
}

function clearChapterCache(bookId: string) {
  try {
    const zStorage = (window as any).ztools?.dbStorage
    const storage = zStorage?.removeItem ? zStorage : window.localStorage
    storage.removeItem(getChapterCacheKey(bookId))
  } catch {}
}

async function parseBookAndGetChapters(book: typeof bookStore.currentBook): Promise<any[]> {
  if (!book) throw new Error('书籍不存在')

  if (book.format === 'txt') {
    const text = (window as any).services?.readFile(book.filePath) ?? ''
    return parseTxt(text, configStore.config.other.chapterRegex || undefined)
  } else {
    const content = (window as any).services?.readFileBinary?.(book.filePath)
    if (!content) throw new Error('无法读取文件')
    const blob = new Blob([content], { type: 'application/epub+zip' })
    const file = new File([blob], book.filePath.split(/[\\/]/).pop() ?? 'book.epub')
    const { chapters } = await parseEpub(file)
    return chapters
  }
}

async function openBookAndHushreader(bookId: string) {
  bookStore.setCurrentBook(bookId)
  const book = bookStore.currentBook
  if (!book) return

  const startChapter = book.lastChapter ?? 0
  const startIndex = book.progressIndex ?? 0

  readerStore.isLoading = true

  try {
    const currentModified = getFileModifiedTime(book.filePath)
    const cacheChapters = await loadChaptersFromCache(bookId)

    if (cacheChapters && cacheChapters.length > 0 && currentModified === book.fileModifiedAt) {
      readerStore.setChapters(cacheChapters)
    } else {
      const chapters = await parseBookAndGetChapters(book)
      readerStore.setChapters(chapters)
      await saveChaptersToCache(bookId, chapters)
      bookStore.updateBook(bookId, { fileModifiedAt: currentModified })
    }

    updateHushreaderLayout()

    readerStore.goToProgress(startChapter, startIndex)

    hushreaderActivated.value = true
    isReaderHidden.value = false
    ensureHushreaderWindow()
    nextTick(() => {
      pushHushreaderState()
    })
  } catch (e: any) {
    alert(`打开失败：${e.message}`)
  } finally {
    readerStore.isLoading = false
  }
}

provide('openBookAndHushreader', openBookAndHushreader)
provide('hideHushreaderWindow', hideHushreaderWindow)

function resizeHushreaderWindow(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return
  const size = clampHushreaderSize(width, height)
  hushreaderCfg.value.hushreaderWidth = size.width
  hushreaderCfg.value.hushreaderHeight = size.height
  positionHushreaderWindow()
  updateHushreaderLayout()
  nextTick(pushHushreaderState)
  configStore.save()
}

function moveHushreaderWindow(x: number, y: number) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return
  const bounds = getMovedHushreaderWindowBounds(x, y)
  hushreaderCfg.value.hushreaderX = bounds.x
  hushreaderCfg.value.hushreaderY = bounds.y
  applyHushreaderWindowBounds(bounds)
  nextTick(pushHushreaderState)
  configStore.save()
}

function previewHushreaderWindowSize(width: number, height: number) {
  if (!hushreaderWindow || hushreaderWindow.isDestroyed?.() || !Number.isFinite(width) || !Number.isFinite(height)) return
  applyHushreaderWindowBounds(getAnchoredHushreaderWindowBoundsForSize(width, height))
}

function previewHushreaderWindowPosition(x: number, y: number) {
  if (!hushreaderWindow || hushreaderWindow.isDestroyed?.() || !Number.isFinite(x) || !Number.isFinite(y)) return
  applyHushreaderWindowBounds(getMovedHushreaderWindowBounds(x, y))
}

function handleHushreaderCommand(command: HushreaderCommand) {
  if (typeof command !== 'string') {
    if (command?.type === 'resize-preview' && typeof command.width === 'number' && typeof command.height === 'number') {
      previewHushreaderWindowSize(command.width, command.height)
    }
    if (command?.type === 'resize' && typeof command.width === 'number' && typeof command.height === 'number') {
      resizeHushreaderWindow(command.width, command.height)
    }
    if (command?.type === 'move-preview' && typeof command.x === 'number' && typeof command.y === 'number') {
      previewHushreaderWindowPosition(command.x, command.y)
    }
    if (command?.type === 'move' && typeof command.x === 'number' && typeof command.y === 'number') {
      moveHushreaderWindow(command.x, command.y)
    }
    return
  }
  if (command === 'prev') { readerStore.prevPage(); saveReadingProgress() }
  else if (command === 'next') { readerStore.nextPage(); saveReadingProgress() }
  else if (command === 'focus') focusHushreaderKeyboard()
  else if (command === 'blur') blurHushreaderKeyboard()
  else if (command === 'hide') hideHushreaderWindow()
  else if (command === 'close') closePlugin()
  else if (command === 'auto') toggleAutoPaging()
}

watch(
  () => hushreaderCfg.value.autoFlipEnabled,
  (enabled) => {
    if (enabled && currentBook.value && !isReaderHidden.value) {
      isAutoPaging.value = true
    } else {
      isAutoPaging.value = false
    }
  }
)

watch(
  () => [isAutoPaging.value, hushreaderCfg.value.autoFlipInterval, bookStore.currentBookId, isReaderHidden.value],
  () => {
    window.clearInterval(autoTimer)
    if (!isAutoPaging.value || !currentBook.value || isReaderHidden.value) return
    autoTimer = window.setInterval(() => {
      if (isAutoPageTickRunning) return
      isAutoPageTickRunning = true
      try {
        const advanced = readerStore.nextPage()
        if (advanced) saveReadingProgress()
        else {
          if (!hushreaderCfg.value.continuousFlip) {
            isAutoPaging.value = false
            hushreaderCfg.value.autoFlipEnabled = false
          }
        }
      } finally {
        isAutoPageTickRunning = false
      }
    }, Math.max(1000, hushreaderCfg.value.autoFlipInterval))
  },
  { immediate: true }
)

watch(
  () => readerStore.currentChapterIndex,
  () => {
    if (currentBook.value) {
      updateHushreaderLayout()
      saveReadingProgress()
    }
  }
)

watch(
  () => [hushreaderCfg.value.hushreaderHeight, hushreaderCfg.value.hushreaderWidth, hushreaderCfg.value.fontSize, hushreaderCfg.value.lineHeight, hushreaderCfg.value.letterSpacing],
  () => {
    if (currentBook.value && readerStore.chapters.length > 0) {
      updateHushreaderLayout()
    }
  }
)

watch(
  () => [
    bookStore.currentBookId,
    readerStore.currentChapterIndex,
    readerStore.progressIndex,
    readerStore.readingPercent,
    isReaderHidden.value,
    hushreaderCfg.value.fontSize,
    hushreaderCfg.value.lineHeight,
    hushreaderCfg.value.hushreaderWidth,
    hushreaderCfg.value.hushreaderHeight,
    hushreaderCfg.value.hushreaderX,
    hushreaderCfg.value.hushreaderY,
    hushreaderCfg.value.letterSpacing,
    hushreaderCfg.value.opacity,
    hushreaderCfg.value.bgOpacity,
    hushreaderCfg.value.prevPageKey,
    hushreaderCfg.value.nextPageKey,
    hushreaderCfg.value.showHushreaderMeta,
    hushreaderCfg.value.progressMode,
    hushreaderCfg.value.hideOnMouseLeave,
    hushreaderCfg.value.wheelTurnPage,
    hushreaderCfg.value.bgColor,
    hushreaderCfg.value.textColor
  ],
  () => {
    nextTick(() => {
      if (hushreaderActivated.value && currentBook.value) {
        ensureHushreaderWindow()
      } else {
        pushHushreaderState()
      }
    })
  }
)

onMounted(() => {
  configStore.load()
  bookStore.load()
  ;(window as any).ztools?.onPluginEnter?.((action: any) => {
    route.value = action.code
    enterAction.value = action
  })
  ;(window as any).ztools?.onPluginOut?.((processExit: boolean) => {
    if (processExit) {
      saveReadingProgress()
      hushreaderActivated.value = false
      hushreaderWindow?.close?.()
    }
  })
  offHushreaderCommand = (window as any).services?.onHushreaderCommand?.(handleHushreaderCommand)

  if (!route.value) route.value = 'bookshelf'
})

onBeforeUnmount(() => {
  saveReadingProgress()
  window.clearInterval(autoTimer)
  offHushreaderCommand?.()
})
</script>

<template>
  <Bookshelf
    :enter-action="enterAction"
  />
</template>
