<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Book } from '../../stores/books'

const props = defineProps<{
  book: Book
  listMode?: boolean
}>()

const emit = defineEmits<{
  click: []
  contextmenu: [e: MouseEvent]
  'cover-error': []
}>()

const imgError = ref(false)

const displayCover = computed(() => {
  if (imgError.value) return undefined
  return props.book.customCoverImage || props.book.coverImage
})

function onImgError() {
  imgError.value = true
  emit('cover-error')
}

function formatDate(ts: number) {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function progressText(book: Book): string {
  if (!book.lastReadAt) return ''
    if (book.readingPercent != null) {
    return `${book.readingPercent}%`
  }
  if (book.totalChapters && book.lastChapter != null) {
    const pct = Math.round(((book.lastChapter + 1) / book.totalChapters) * 100)
    return `${pct}%`
  }
  return ''
}
</script>

<template>
  <div
    class="book-card"
    :class="{ 'list-mode': listMode }"
    @click="$emit('click')"
    @contextmenu.prevent="$emit('contextmenu', $event)"
  >
    <!-- Cover -->
    <div
      class="book-cover"
      :style="displayCover ? {} : { background: book.coverColor || '#4a7fa5' }"
    >
      <img
        v-if="displayCover"
        :src="displayCover"
        :alt="book.title"
        class="cover-img"
        @error="onImgError"
      />
      <template v-else>
        <span class="cover-format">{{ book.format.toUpperCase() }}</span>
        <span class="cover-title">{{ book.title }}</span>
      </template>
      <span v-if="progressText(book)" class="cover-progress">
        <span class="progress-bar" :style="{ width: progressText(book) }"></span>
        <span class="progress-label">{{ progressText(book) }}</span>
      </span>
    </div>

    <!-- Info -->
    <div class="book-info">
      <p class="book-title">{{ book.title }}</p>
      <p class="book-author">{{ book.author || '未知作者' }}</p>
      <p v-if="listMode" class="book-meta">
        {{ (book.categories || []).join('、') }}{{ book.categories?.length && book.lastReadAt ? ' · ' : '' }}{{ book.lastReadAt ? formatDate(book.lastReadAt) : '' }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.book-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
  border-radius: var(--radius-md);
  padding: 6px;
  transition: background 0.15s var(--ease-out), box-shadow 0.15s var(--ease-out);
}
.book-card:hover {
  background: var(--c-surface-sunken);
}

.book-card.list-mode {
  flex-direction: row;
  align-items: center;
  gap: 14px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
}

.book-cover {
  position: relative;
  aspect-ratio: 0.68;
  border-radius: var(--radius-sm);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px;
  box-shadow: var(--shadow-sm);
}

.list-mode .book-cover {
  width: 36px;
  height: 50px;
  flex-shrink: 0;
  aspect-ratio: unset;
  border-radius: var(--radius-xs);
}

.cover-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-format {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.5px;
  color: rgba(255,255,255,0.6);
  text-transform: uppercase;
}

.cover-title {
  font-size: 11px;
  color: #fff;
  text-align: center;
  line-height: 1.35;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  word-break: break-all;
}

.cover-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 20px;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  overflow: hidden;
}

.progress-bar {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: rgba(255,255,255,0.12);
  transition: width 0.3s var(--ease-out);
}

.progress-label {
  position: relative;
  z-index: 1;
  width: 100%;
  text-align: center;
  font-size: 9px;
  color: rgba(255,255,255,0.9);
  font-variant-numeric: tabular-nums;
  font-family: var(--font-mono);
}

.book-info {
  min-width: 0;
  flex: 1;
}

.book-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--c-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}

.list-mode .book-title { font-size: 13px; }

.book-author {
  margin-top: 2px;
  font-size: 11px;
  color: var(--c-ink-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.book-meta {
  margin-top: 2px;
  font-size: 11px;
  color: var(--c-ink-tertiary);
}
</style>
