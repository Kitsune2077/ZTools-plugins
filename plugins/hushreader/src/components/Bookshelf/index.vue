<script setup lang="ts">
import { ref, computed, inject, onMounted, onBeforeUnmount, watch } from 'vue'
import { useBookStore } from '../../stores/books'
import { useConfigStore } from '../../stores/config'
import { useReaderStore } from '../../stores/reader'
import { parseTxt } from '../../utils/txtParser'
import { parseEpub } from '../../utils/epubParser'
import { parseMobi } from '../../utils/mobiParser'
import { saveCover, loadCover, removeCover, saveCustomCover, loadCustomCover, removeCustomCover, removeBookData } from '../../utils/db'
import SettingsModal from '../Settings/index.vue'
import ContextMenu from './ContextMenu.vue'
import BookCard from './BookCard.vue'
import Toast from './Toast.vue'
import Modal from './Modal.vue'
import ThemeToggle from './ThemeToggle.vue'

const props = defineProps<{ enterAction?: any }>()

const bookStore = useBookStore()
const configStore = useConfigStore()
const readerStore = useReaderStore()

const openBookAndHushreader = inject<(id: string) => void>('openBookAndHushreader')
const hideHushreaderWindow = inject<() => void>('hideHushreaderWindow')

function handleHideHushreaderWindow() {
  hideHushreaderWindow?.()
  toast('隐阅窗口已关闭', 'success')
}

const showSettings = ref(false)
const isLoading = ref(false)

// Toast
const toastMsg = ref('')
const toastType = ref<'info' | 'error' | 'success'>('info')
let toastTimer = 0
function toast(msg: string, type: 'info' | 'error' | 'success' = 'info') {
  toastMsg.value = msg
  toastType.value = type
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { toastMsg.value = '' }, 3000)
}

// Context menu
const contextMenuBook = ref<string | null>(null)
const contextMenuPos = ref({ x: 0, y: 0 })

function onContextMenu(bookId: string, e: MouseEvent) {
  e.preventDefault()
  contextMenuBook.value = bookId
  const target = (e.currentTarget as HTMLElement)
  const rect = target?.getBoundingClientRect()
  if (rect) {
    contextMenuPos.value = {
      x: rect.right - rect.width / 3,
      y: rect.bottom - rect.height / 3
    }
  } else {
    contextMenuPos.value = { x: e.clientX, y: e.clientY }
  }
}

function closeContextMenu() {
  contextMenuBook.value = null
}

// Chapter list modal
const showChapterList = ref(false)
const chapterListBookId = ref<string | null>(null)
const chapterListLoading = ref(false)
const chapterListItems = ref<{ index: number; title: string }[]>([])
const chapterListCurrentIndex = ref(-1)

async function openChapterList(bookId: string) {
  closeContextMenu()
  chapterListBookId.value = bookId
  chapterListItems.value = []
  chapterListCurrentIndex.value = -1
  showChapterList.value = true
  chapterListLoading.value = true

  const book = bookStore.books.find(b => b.id === bookId)
  if (!book) { chapterListLoading.value = false; return }

  chapterListCurrentIndex.value = book.lastChapter ?? -1

  try {
    if (book.format === 'txt') {
      const text = window.services?.readFile(book.filePath) ?? ''
      const chapters = parseTxt(text, configStore.config.other.chapterRegex || undefined)
      chapterListItems.value = chapters.map(c => ({ index: c.index, title: c.title }))
    } else if (book.format === 'mobi') {
      const content = window.services?.readFileBinary?.(book.filePath)
      if (content) {
        const blob = new Blob([content], { type: 'application/x-mobipocket-ebook' })
        const file = new File([blob], book.filePath.split(/[\\/]/).pop() ?? 'book.mobi')
        const result = await parseMobi(file)
        if (result.error) { toast(`加载章节失败：${result.error}`, 'error'); showChapterList.value = false; return }
        chapterListItems.value = result.chapters.map(c => ({ index: c.index, title: c.title }))
      }
    } else {
      const content = window.services?.readFileBinary?.(book.filePath)
      if (content) {
        const blob = new Blob([content], { type: 'application/epub+zip' })
        const file = new File([blob], book.filePath.split(/[\\/]/).pop() ?? 'book.epub')
        const { chapters } = await parseEpub(file)
        chapterListItems.value = chapters.map(c => ({ index: c.index, title: c.title }))
      }
    }
  } catch (e: any) {
    toast(`加载章节失败：${e.message}`, 'error')
    showChapterList.value = false
  } finally {
    chapterListLoading.value = false
    if (chapterListCurrentIndex.value >= 0) {
      requestAnimationFrame(() => {
        const el = document.querySelector('.chapter-item.current')
        el?.scrollIntoView({ block: 'center', behavior: 'instant' })
      })
    }
  }
}

function jumpToChapter(chapterIndex: number) {
  showChapterList.value = false
  const bookId = chapterListBookId.value
  if (!bookId) return
  // Set lastChapter so it opens at that chapter
  bookStore.updateBook(bookId, { lastChapter: chapterIndex, lastPage: 0 })
  openBookAndHushreader?.(bookId)
}

// Change file path
const showPathModal = ref(false)
const pathModalBookId = ref<string | null>(null)
const pathModalValue = ref('')

function openPathModal(bookId: string) {
  closeContextMenu()
  const book = bookStore.books.find(b => b.id === bookId)
  if (!book) return
  pathModalBookId.value = bookId
  pathModalValue.value = book.filePath
  showPathModal.value = true
}

function confirmPath() {
  if (!pathModalBookId.value || !pathModalValue.value.trim()) return
  bookStore.updateBook(pathModalBookId.value, { filePath: pathModalValue.value.trim() })
  showPathModal.value = false
  toast('路径已更新', 'success')
}

// Category modal
const showCategoryModal = ref(false)
const categoryModalBookId = ref<string | null>(null)
const categoryModalSelected = ref<string[]>([])
const categoryModalNew = ref('')

function openCategoryModal(bookId: string) {
  closeContextMenu()
  const book = bookStore.books.find(b => b.id === bookId)
  if (!book) return
  categoryModalBookId.value = bookId
  categoryModalSelected.value = [...(book.categories || [])]
  categoryModalNew.value = ''
  showCategoryModal.value = true
}

function toggleCategorySelection(cat: string) {
  const idx = categoryModalSelected.value.indexOf(cat)
  if (idx > -1) {
    categoryModalSelected.value.splice(idx, 1)
  } else {
    categoryModalSelected.value.push(cat)
  }
}

function confirmCategory() {
  if (!categoryModalBookId.value) return
  const newCats = categoryModalNew.value
    .split(/[,，]/)
    .map(s => s.trim())
    .filter(Boolean)
  const finalCats = [...new Set([...categoryModalSelected.value, ...newCats])]
  bookStore.updateBook(categoryModalBookId.value, { categories: finalCats.length > 0 ? finalCats : undefined })
  showCategoryModal.value = false
  toast('分类已更新', 'success')
}

// Edit metadata
const showMetadataModal = ref(false)
const metadataModalBookId = ref<string | null>(null)
const metadataModalTitle = ref('')
const metadataModalAuthor = ref('')

function openMetadataModal(bookId: string) {
  closeContextMenu()
  const book = bookStore.books.find(b => b.id === bookId)
  if (!book) return
  metadataModalBookId.value = bookId
  metadataModalTitle.value = book.title
  metadataModalAuthor.value = book.author
  showMetadataModal.value = true
}

function confirmMetadata() {
  if (!metadataModalBookId.value) return
  bookStore.updateBook(metadataModalBookId.value, {
    title: metadataModalTitle.value.trim() || '未命名',
    author: metadataModalAuthor.value.trim()
  })
  showMetadataModal.value = false
  toast('元数据已更新', 'success')
}

// Custom cover
function openCoverPicker(bookId: string) {
  closeContextMenu()
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const data = reader.result as string
      bookStore.updateBook(bookId, { customCoverImage: data })
      saveCustomCover(bookId, data).catch(() => {})
      toast('封面已更新', 'success')
    }
    reader.readAsDataURL(file)
  }
  input.click()
}

async function repairCover(bookId: string) {
  const book = bookStore.books.find(b => b.id === bookId)
  if (!book || book.format !== 'epub' || configStore.config.other.plainTextCover) {
    bookStore.updateBook(bookId, { coverImage: undefined })
    removeCover(bookId).catch(() => {})
    return
  }
  try {
    const content = window.services?.readFileBinary?.(book.filePath)
    if (!content) {
      bookStore.updateBook(bookId, { coverImage: undefined })
      removeCover(bookId).catch(() => {})
      return
    }
    const blob = new Blob([content], { type: 'application/epub+zip' })
    const file = new File([blob], book.filePath.split(/[\\/]/).pop() ?? 'book.epub')
    const result = await parseEpub(file)
    if (result.coverUrl) {
      bookStore.updateBook(bookId, { coverImage: result.coverUrl })
      saveCover(bookId, result.coverUrl).catch(() => {})
    } else {
      bookStore.updateBook(bookId, { coverImage: undefined })
      removeCover(bookId).catch(() => {})
    }
  } catch {
    bookStore.updateBook(bookId, { coverImage: undefined })
    removeCover(bookId).catch(() => {})
  }
}

// Delete modal
const showDeleteModal = ref(false)
const deleteBookId = ref<string | null>(null)

function openDeleteModal(bookId: string) {
  closeContextMenu()
  deleteBookId.value = bookId
  showDeleteModal.value = true
}

function confirmDelete() {
  if (!deleteBookId.value) return
  bookStore.removeBook(deleteBookId.value)
  showDeleteModal.value = false
  toast('已删除', 'info')
}

// Import book
async function importBook(filePath: string) {
  if (!filePath) return
  const name = filePath.split(/[\\/]/).pop() ?? ''
  const isEpub = /\.epub$/i.test(name)
  const isTxt = /\.txt$/i.test(name)
  const isMobi = /\.mobi$/i.test(name)
  if (!isEpub && !isTxt && !isMobi) {
    toast('仅支持 EPUB、TXT 和 MOBI 格式', 'error')
    return
  }

  isLoading.value = true
  try {
    let title = name.replace(/\.(epub|txt|mobi)$/i, '')
    let author = ''
    let coverColor = randomCoverColor()
    let coverImage: string | undefined

    if (isEpub) {
      try {
        const content = window.services?.readFileBinary?.(filePath)
        if (content) {
          const blob = new Blob([content], { type: 'application/epub+zip' })
          const file = new File([blob], name)
          const result = await parseEpub(file)
          title = result.title || title
          author = result.author || ''
          if (result.coverUrl && !configStore.config.other.plainTextCover) coverImage = result.coverUrl
        }
      } catch {}
    }

    if (isMobi) {
      try {
        const content = window.services?.readFileBinary?.(filePath)
        if (content) {
          const blob = new Blob([content], { type: 'application/x-mobipocket-ebook' })
          const file = new File([blob], name)
          const result = await parseMobi(file)
          if (result.error) { toast(`MOBI解析失败：${result.error}`, 'error'); return }
          title = result.title || title
          author = result.author || ''
          if (result.coverUrl && !configStore.config.other.plainTextCover) coverImage = result.coverUrl
        }
      } catch (e: any) {
        toast(`MOBI导入失败：${e.message}`, 'error'); return
      }
    }

    const fileModifiedAt = window.services?.getFileModifiedTime?.(filePath)

    const book = bookStore.addBook({
      title, author,
      format: isEpub ? 'epub' : isMobi ? 'mobi' : 'txt',
      filePath,
      coverColor,
      coverImage,
      fileModifiedAt
    })

    if (book) {
      if (coverImage) saveCover(book.id, coverImage).catch(() => {})
      toast(`《${title}》已加入书架`, 'success')
    } else {
      toast('该书籍已在书架中', 'info')
    }
  } catch (error: any) {
    toast(`导入失败: ${error.message || error}`, 'error')
  } finally {
    isLoading.value = false
  }
}

function handleAddBook() {
  const picker = window.ztools?.showOpenDialog({
    title: '选择书籍',
    buttonLabel: '导入',
    filters: [{ name: '书籍文件', extensions: ['epub', 'txt', 'mobi'] }],
    properties: ['openFile']
  })

  if (picker?.[0]) importBook(picker[0])
}

// Handle plugin enter with file import
onMounted(() => {
  if (props.enterAction?.code === 'import' && props.enterAction?.type === 'files') {
    const filePath = props.enterAction?.payload?.[0]?.path
    if (filePath) importBook(filePath)
  }
})

// Drag and drop import
function onDrop(e: DragEvent) {
  e.preventDefault()
  const files = e.dataTransfer?.files
  if (!files?.length) return
  const file = files[0]
  // In Electron context the path is available
  const filePath = (file as any).path
  if (filePath) importBook(filePath)
}

function onDragover(e: DragEvent) {
  e.preventDefault()
}

// Close context menu on outside click
function onDocClick(e: MouseEvent) {
  if (contextMenuBook.value) {
    closeContextMenu()
  }
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
})

function randomCoverColor(): string {
  const colors = [
    '#4a7fa5', '#5c7a6e', '#7a5c6e', '#7a6e5c',
    '#5c6e7a', '#6e7a5c', '#7a5c5c', '#5c5c7a'
  ]
  return colors[Math.floor(Math.random() * colors.length)]
}

async function resolveEpubCovers() {
  if (configStore.config.other.plainTextCover) return
  const epubBooks = bookStore.books.filter(b => b.format === 'epub' && !b.coverImage && !b.customCoverImage)
  for (const book of epubBooks) {
    try {
      const cached = await loadCover(book.id)
      if (cached) {
        book.coverImage = cached
        continue
      }
      const content = window.services?.readFileBinary?.(book.filePath)
      if (!content) continue
      const blob = new Blob([content], { type: 'application/epub+zip' })
      const file = new File([blob], book.filePath.split(/[\\/]/).pop() ?? 'book.epub')
      const result = await parseEpub(file)
      if (result.coverUrl) {
        book.coverImage = result.coverUrl
        saveCover(book.id, result.coverUrl).catch(() => {})
      }
    } catch {}
  }
}

watch(() => bookStore.books.length, () => {
  resolveEpubCovers()
}, { immediate: true })

watch(() => configStore.config.other.plainTextCover, async (plain) => {
  if (plain) {
    for (const b of bookStore.books) {
      b.coverImage = undefined
      b.customCoverImage = undefined
    }
    await Promise.allSettled(bookStore.books.flatMap(b => [removeCover(b.id), removeCustomCover(b.id)]))
  } else {
    resolveEpubCovers()
  }
})

const cfg = computed(() => configStore.config)
</script>

<template>
  <div class="bookshelf" @drop="onDrop" @dragover="onDragover">
    <!-- Header -->
    <header class="shelf-header">
      <h1 class="shelf-title">书架</h1>
      <div class="shelf-search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          v-model="bookStore.searchQuery"
          class="search-input"
          placeholder="搜索书名或作者..."
        />
      </div>
      <div class="shelf-actions">
        <button class="icon-btn" title="关闭隐阅窗口" @click="handleHideHushreaderWindow">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          </svg>
        </button>
        <button class="icon-btn" title="设置" @click="showSettings = true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>
    </header>

    <!-- Category tabs -->
    <div class="category-bar">
      <button
        v-for="cat in bookStore.categories"
        :key="cat"
        class="category-tab"
        :class="{ active: bookStore.activeCategory === cat }"
        @click="bookStore.activeCategory = cat"
      >{{ cat }}</button>
      <div class="sort-group">
        <button
          class="sort-btn"
          :class="{ active: bookStore.sortBy === 'lastReadAt' }"
          @click="bookStore.sortBy = 'lastReadAt'"
        >最近阅读</button>
        <button
          class="sort-btn"
          :class="{ active: bookStore.sortBy === 'addedAt' }"
          @click="bookStore.sortBy = 'addedAt'"
        >最近添加</button>
        <button
          class="sort-btn"
          :class="{ active: bookStore.sortBy === 'name' }"
          @click="bookStore.sortBy = 'name'"
        >名称</button>
        <button
          class="sort-btn"
          :class="{ active: bookStore.sortBy === 'author' }"
          @click="bookStore.sortBy = 'author'"
        >作者</button>
      </div>
    </div>

    <!-- Book grid -->
    <main class="shelf-grid" :class="{ 'list-mode': cfg.other.listMode }">
      <!-- Add book card -->
      <div class="add-book-card" @click="handleAddBook" :class="{ loading: isLoading }">
        <div class="add-icon">
          <svg v-if="!isLoading" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          <div v-else class="spinner"></div>
        </div>
        <span class="add-label">添加本地书籍</span>
        <span class="add-sub">支持 EPUB / TXT / MOBI</span>
      </div>

      <!-- Book cards -->
      <BookCard
        v-for="book in bookStore.filteredBooks"
        :key="book.id"
        :book="book"
        :list-mode="cfg.other.listMode"
        @click="openBookAndHushreader?.(book.id)"
        @contextmenu.prevent="onContextMenu(book.id, $event)"
        @cover-error="repairCover(book.id)"
      />
    </main>

    <!-- Empty state -->
    <div v-if="bookStore.filteredBooks.length === 0 && !isLoading" class="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      </svg>
      <p>{{ bookStore.searchQuery ? '未找到匹配的书籍' : '书架空空如也，添加一本书开始阅读吧' }}</p>
    </div>

    <!-- Context Menu -->
    <ContextMenu
      v-if="contextMenuBook"
      :pos="contextMenuPos"
      @chapter-list="openChapterList(contextMenuBook!)"
      @change-path="openPathModal(contextMenuBook!)"
      @edit-metadata="openMetadataModal(contextMenuBook!)"
      @set-category="openCategoryModal(contextMenuBook!)"
      @set-cover="openCoverPicker(contextMenuBook!)"
      @delete="openDeleteModal(contextMenuBook!)"
      @close="closeContextMenu"
    />

    <!-- Settings Modal -->
    <SettingsModal v-if="showSettings" @close="showSettings = false" />

    <!-- Chapter List Modal -->
    <Modal v-if="showChapterList" title="章节列表" @close="showChapterList = false">
      <div class="chapter-list">
        <div v-if="chapterListLoading" class="modal-loading">
          <div class="spinner"></div>
          <span>正在解析章节...</span>
        </div>
        <div v-else class="chapter-items">
          <button
            v-for="ch in chapterListItems"
            :key="ch.index"
            class="chapter-item"
            :class="{ current: ch.index === chapterListCurrentIndex }"
            @click="jumpToChapter(ch.index)"
          >
            <span class="ch-index">{{ ch.index + 1 }}</span>
            <span class="ch-title">{{ ch.title }}</span>
          </button>
        </div>
      </div>
    </Modal>

    <!-- Path Modal -->
    <Modal v-if="showPathModal" title="修改本地路径" @close="showPathModal = false">
      <div class="form-modal">
        <label class="form-label">文件路径</label>
        <input v-model="pathModalValue" class="form-input" placeholder="/path/to/book.epub" />
        <div class="form-actions">
          <button class="btn-secondary" @click="showPathModal = false">取消</button>
          <button class="btn-primary" @click="confirmPath">确认</button>
        </div>
      </div>
    </Modal>

    <!-- Category Modal -->
    <Modal v-if="showCategoryModal" title="设置分类" @close="showCategoryModal = false">
      <div class="form-modal">
        <label class="form-label">已有分类（多选）</label>
        <div v-if="bookStore.categories.length > 1" class="category-tags">
          <button
            v-for="cat in bookStore.categories.filter(c => c !== '全部')"
            :key="cat"
            class="category-tag"
            :class="{ active: categoryModalSelected.includes(cat) }"
            @click="toggleCategorySelection(cat)"
          >
            {{ cat }}
          </button>
        </div>
        <p v-else class="form-hint">暂无其他分类</p>
        <label class="form-label" style="margin-top: 12px">新建分类</label>
        <input v-model="categoryModalNew" class="form-input" placeholder="输入新分类名称，多个用逗号分隔..." />
        <p class="form-hint">留空则不添加新分类</p>
        <div class="form-actions">
          <button class="btn-secondary" @click="showCategoryModal = false">取消</button>
          <button class="btn-primary" @click="confirmCategory">确认</button>
        </div>
      </div>
    </Modal>

    <!-- Metadata Modal -->
    <Modal v-if="showMetadataModal" title="编辑元数据" @close="showMetadataModal = false">
      <div class="form-modal">
        <label class="form-label">书籍标题</label>
        <input v-model="metadataModalTitle" class="form-input" placeholder="输入书籍标题..." />
        <label class="form-label" style="margin-top: 12px">作者</label>
        <input v-model="metadataModalAuthor" class="form-input" placeholder="输入作者名称..." />
        <div class="form-actions">
          <button class="btn-secondary" @click="showMetadataModal = false">取消</button>
          <button class="btn-primary" @click="confirmMetadata">保存</button>
        </div>
      </div>
    </Modal>

    <!-- Delete Confirm Modal -->
    <Modal v-if="showDeleteModal" title="删除书籍" @close="showDeleteModal = false">
      <div class="form-modal">
        <p style="margin: 0 0 16px; color: var(--c-ink)">确定从书架中删除这本书吗？本地文件不会被删除。</p>
        <div class="form-actions">
          <button class="btn-secondary" @click="showDeleteModal = false">取消</button>
          <button class="btn-danger" @click="confirmDelete">删除</button>
        </div>
      </div>
    </Modal>

    <!-- Toast -->
    <Toast :message="toastMsg" :type="toastType" />

    <!-- Theme Toggle -->
    <div class="theme-toggle-fab">
      <ThemeToggle />
    </div>
  </div>
</template>

<style scoped>
.bookshelf {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--c-surface);
  color: var(--c-ink);
  overflow: hidden;
}

.shelf-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 20px 12px;
  flex-shrink: 0;
}

.shelf-title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
  white-space: nowrap;
  color: var(--c-ink);
}

.shelf-search {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--c-surface-sunken);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-md);
  padding: 6px 12px;
  color: var(--c-ink-tertiary);
  min-width: 0;
  transition: border-color 0.15s var(--ease-out), box-shadow 0.15s var(--ease-out);
}

.shelf-search:focus-within {
  border-color: var(--c-accent-muted);
  box-shadow: 0 0 0 3px var(--c-accent-soft);
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: var(--c-ink);
  font-size: 13px;
  min-width: 0;
}

.search-input::placeholder {
  color: var(--c-ink-tertiary);
}

.shelf-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  color: var(--c-ink-secondary);
  transition: background 0.15s var(--ease-out), color 0.15s var(--ease-out);
}

.icon-btn:hover {
  background: var(--c-surface-sunken);
  color: var(--c-ink);
}

.category-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 20px 10px;
  flex-shrink: 0;
  overflow-x: auto;
  border-bottom: 1px solid var(--c-border);
}

.category-bar::-webkit-scrollbar { display: none; }

.category-tab {
  padding: 5px 12px;
  border-radius: var(--radius-full);
  font-size: 13px;
  white-space: nowrap;
  color: var(--c-ink-secondary);
  transition: background 0.15s var(--ease-out), color 0.15s var(--ease-out);
}

.category-tab:hover {
  background: var(--c-surface-sunken);
  color: var(--c-ink);
}

.category-tab.active {
  background: var(--c-accent);
  color: var(--c-ink-inverse);
}

.sort-group {
  display: flex;
  gap: 2px;
  margin-left: auto;
  flex-shrink: 0;
  background: var(--c-surface-sunken);
  border-radius: var(--radius-sm);
  padding: 2px;
}

.sort-btn {
  padding: 4px 10px;
  font-size: 12px;
  border-radius: var(--radius-xs);
  color: var(--c-ink-tertiary);
  transition: background 0.15s var(--ease-out), color 0.15s var(--ease-out);
}

.sort-btn:hover {
  color: var(--c-ink-secondary);
}

.sort-btn.active {
  background: var(--c-surface);
  color: var(--c-accent);
  box-shadow: var(--shadow-xs);
}

.shelf-grid {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 16px;
  align-content: start;
}

.shelf-grid.list-mode {
  grid-template-columns: 1fr;
  gap: 4px;
}

.add-book-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  aspect-ratio: 0.68;
  border: 2px dashed var(--c-border-strong);
  border-radius: var(--radius-lg);
  cursor: pointer;
  color: var(--c-ink-tertiary);
  padding: 16px;
  text-align: center;
  transition: border-color 0.2s var(--ease-out), color 0.2s var(--ease-out), background 0.2s var(--ease-out);
}

.shelf-grid.list-mode .add-book-card {
  aspect-ratio: unset;
  flex-direction: row;
  gap: 12px;
  padding: 12px 16px;
  justify-content: flex-start;
  border-radius: var(--radius-md);
}

.add-book-card:hover {
  border-color: var(--c-accent);
  color: var(--c-accent);
  background: var(--c-accent-soft);
}

.add-book-card.loading {
  pointer-events: none;
  opacity: 0.5;
}

.add-label {
  font-size: 13px;
  font-weight: 600;
}

.add-sub {
  font-size: 11px;
  opacity: 0.7;
}

.shelf-grid.list-mode .add-sub { display: none; }

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--c-border);
  border-top-color: var(--c-accent);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

.empty-state {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: var(--c-ink-tertiary);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.empty-state p {
  font-size: 13px;
  line-height: 1.6;
}

.chapter-list {
  max-height: 360px;
  overflow-y: auto;
}

.modal-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 28px;
  justify-content: center;
  color: var(--c-ink-tertiary);
  font-size: 13px;
}

.chapter-items {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.chapter-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
  text-align: left;
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--c-ink);
  transition: background 0.12s var(--ease-out);
}

.chapter-item:hover { background: var(--c-surface-sunken); }

.chapter-item.current {
  background: var(--c-accent-soft);
  color: var(--c-accent);
}

.chapter-item.current .ch-index {
  color: var(--c-accent);
}

.ch-index {
  min-width: 28px;
  color: var(--c-ink-tertiary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  font-family: var(--font-mono);
}

.ch-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.form-modal { display: flex; flex-direction: column; gap: 10px; }
.form-label { font-size: 12px; font-weight: 600; color: var(--c-ink-secondary); text-transform: uppercase; letter-spacing: 0.04em; }
.form-input {
  border: 1px solid var(--c-border);
  background: var(--c-surface);
  color: var(--c-ink);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  font-size: 13px;
  transition: border-color 0.15s var(--ease-out), box-shadow 0.15s var(--ease-out);
}
.form-input:focus {
  border-color: var(--c-accent);
  box-shadow: 0 0 0 3px var(--c-accent-soft);
}
.form-hint { font-size: 11px; color: var(--c-ink-tertiary); }
.form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }

.category-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.category-tag {
  padding: 4px 12px;
  border: 1px solid var(--c-border);
  background: var(--c-surface);
  color: var(--c-ink-secondary);
  border-radius: var(--radius-full);
  font-size: 12px;
  user-select: none;
  transition: all 0.15s var(--ease-out);
}

.category-tag:hover {
  border-color: var(--c-accent);
  color: var(--c-accent);
}

.category-tag.active {
  background: var(--c-accent);
  color: var(--c-ink-inverse);
  border-color: var(--c-accent);
}

.btn-primary, .btn-secondary, .btn-danger {
  padding: 7px 18px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s var(--ease-out);
}
.btn-primary {
  background: var(--c-accent);
  color: var(--c-ink-inverse);
}
.btn-primary:hover { background: var(--c-accent-hover); }
.btn-secondary {
  background: var(--c-surface-sunken);
  color: var(--c-ink);
}
.btn-secondary:hover { background: var(--c-border); }
.btn-danger {
  background: var(--c-danger);
  color: var(--c-ink-inverse);
}
.btn-danger:hover { opacity: 0.85; }

.theme-toggle-fab {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 100;
}
</style>
