import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface Book {
  id: string
  title: string
  author: string
  format: 'epub' | 'txt'
  filePath: string
  coverColor?: string
  coverImage?: string
  customCoverImage?: string
  categories?: string[]
  addedAt: number
  lastReadAt?: number
  lastChapter?: number
  lastPage?: number
  progressIndex?: number
  totalChapters?: number
  readingPercent?: number
  fileModifiedAt?: number | null
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

export const useBookStore = defineStore('books', () => {
  const books = ref<Book[]>([])
  const currentBookId = ref<string | null>(null)
  const sortBy = ref<'addedAt' | 'name' | 'author'>('addedAt')
  const searchQuery = ref('')
  const activeCategory = ref<string>('全部')

  function load() {
    try {
      const data = storageGet('hushreader_books')
      if (data) {
        const parsed = JSON.parse(data)
        if (Array.isArray(parsed)) {
          // 兼容旧数据：将单分类字段 category 迁移到 categories 数组
          parsed.forEach((b: any) => {
            if (b.category && !b.categories) {
              b.categories = [b.category]
              delete b.category
            }
            if (!Array.isArray(b.categories)) b.categories = []
          })
          books.value = parsed
        }
      }
      const cur = storageGet('hushreader_current')
      if (cur) currentBookId.value = cur
    } catch (e) {
      console.warn('Failed to load books', e)
    }
  }

  function save() {
    try {
      storageSet('hushreader_books', JSON.stringify(books.value))
    } catch (e) {
      console.warn('Failed to save books', e)
    }
  }

  function addBook(book: Omit<Book, 'id' | 'addedAt'>) {
    if (books.value.some(b => b.filePath === book.filePath)) return undefined
    const newBook: Book = {
      ...book,
      id: `book_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      addedAt: Date.now()
    }
    books.value.unshift(newBook)
    save()
    return newBook
  }

  function removeBook(id: string) {
    books.value = books.value.filter(b => b.id !== id)
    if (currentBookId.value === id) currentBookId.value = null
    save()
  }

  function updateBook(id: string, updates: Partial<Book>) {
    const idx = books.value.findIndex(b => b.id === id)
    if (idx !== -1) {
      books.value[idx] = { ...books.value[idx], ...updates }
      save()
    }
  }

  function setCurrentBook(id: string | null) {
    currentBookId.value = id
    try {
      storageSet('hushreader_current', id || '')
    } catch { }
  }

  const currentBook = computed(() =>
    books.value.find(b => b.id === currentBookId.value) ?? null
  )

  const categories = computed(() => {
    const cats = new Set<string>()
    books.value.forEach(b => {
      if (b.categories) {
        b.categories.forEach(c => { if (c) cats.add(c) })
      }
    })
    return ['全部', ...Array.from(cats)]
  })

  const filteredBooks = computed(() => {
    let list = [...books.value]
    if (activeCategory.value !== '全部') {
      list = list.filter(b =>
        b.categories?.some(c => c === activeCategory.value) ?? false
      )
    }
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase()
      list = list.filter(b =>
        b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q)
      )
    }
    if (sortBy.value === 'name') {
      list.sort((a, b) => a.title.localeCompare(b.title))
    } else if (sortBy.value === 'author') {
      list.sort((a, b) => (a.author || '').localeCompare(b.author || ''))
    } else {
      list.sort((a, b) => b.addedAt - a.addedAt)
    }
    return list
  })

  return {
    books, currentBookId, currentBook,
    sortBy, searchQuery, activeCategory, filteredBooks, categories,
    load, addBook, removeBook, updateBook, setCurrentBook
  }
})
