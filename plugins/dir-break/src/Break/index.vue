<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue'
import type { ScanResult, BreakRecord, ConflictStrategy } from '../types'

const props = defineProps({
  enterAction: { type: Object, required: true }
})

const targetDir = ref('')
const recursive = ref(false)
const conflictStrategy = ref<ConflictStrategy>('rename')
const scanResult = ref<ScanResult | null>(null)
const isLoading = ref(false)
const isBreaking = ref(false)
const breakResult = ref<BreakRecord | null>(null)
const history = ref<BreakRecord[]>([])
const error = ref('')
const successMessage = ref('')

const isDragOver = ref(false)

const MAX_PREVIEW_FILES = 40
const MAX_PREVIEW_DIRS = 20
const showAllFiles = ref(false)
const showAllDirs = ref(false)

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB'
  return (bytes / 1073741824).toFixed(2) + ' GB'
}

function formatRelativeTime(ts: number) {
  const diff = Date.now() - ts
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
  return Math.floor(diff / 86400000) + '天前'
}

const previewFiles = computed(() => {
  if (!scanResult.value) return { items: [], remaining: 0 }
  const max = showAllFiles.value ? Infinity : MAX_PREVIEW_FILES
  const items = scanResult.value.files.slice(0, max)
  const remaining = scanResult.value.totalFiles - items.length
  return { items, remaining: Math.max(0, remaining) }
})

const previewDirs = computed(() => {
  if (!scanResult.value) return { items: [], remaining: 0 }
  const topDirs = scanResult.value.dirs.filter(d => d.relativePath.indexOf('/') === -1)
  const max = showAllDirs.value ? Infinity : MAX_PREVIEW_DIRS
  const items = topDirs.slice(0, max)
  const remaining = topDirs.length - items.length
  return { items, remaining: Math.max(0, remaining) }
})

function loadHistory() {
  try {
    history.value = window.services.getHistory()
  } catch {
    history.value = []
  }
}

function setRecursive(val: boolean) {
  recursive.value = val
  showAllFiles.value = false
  showAllDirs.value = false
  if (targetDir.value) {
    loadDirectory(targetDir.value)
  }
}

function loadDirectory(dirPath: string) {
  if (!dirPath) return
  targetDir.value = dirPath
  error.value = ''
  successMessage.value = ''
  breakResult.value = null
  isLoading.value = true

  setTimeout(() => {
    try {
      const result = window.services.scanDirectory(dirPath, recursive.value)
      scanResult.value = result
      if (result.totalFiles === 0 && result.totalDirs === 0) {
        error.value = '该文件夹为空'
      }
    } catch (err: any) {
      error.value = err.message || '读取文件夹失败'
      scanResult.value = null
    } finally {
      isLoading.value = false
    }
  }, 0)
}

function handleSelectFolder() {
  const dirs = window.ztools.showOpenDialog({
    title: '选择要解散的文件夹',
    properties: ['openDirectory']
  })
  if (dirs && dirs.length > 0) {
    loadDirectory(dirs[0])
  }
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = true
}

function handleDragLeave() {
  isDragOver.value = false
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = false
  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    const path = (window.ztools as any).getPathForFile(files[0])
    if (path) {
      loadDirectory(path)
    }
  }
}

function handleBreak() {
  if (!targetDir.value || !scanResult.value || (scanResult.value.totalFiles === 0 && scanResult.value.totalDirs === 0)) return

  isBreaking.value = true
  error.value = ''
  successMessage.value = ''

  try {
    const record = window.services.breakDirectory(targetDir.value, {
      recursive: recursive.value,
      conflictStrategy: conflictStrategy.value
    })
    breakResult.value = record
    const parts: string[] = ['已解散 ' + record.targetName]
    if (record.summary.totalMoved > 0) {
      parts.push('移动 ' + record.summary.totalMoved + ' 个文件')
    }
    if (record.summary.totalDirsMoved > 0) {
      parts.push('移动 ' + record.summary.totalDirsMoved + ' 个目录')
    }
    if (record.summary.totalDeleted > 0) {
      parts.push('删除 ' + record.summary.totalDeleted + ' 个空文件夹')
    }
    successMessage.value = parts.join(' · ')
    scanResult.value = null
    targetDir.value = ''
    loadHistory()
  } catch (err: any) {
    error.value = err.message || '解散失败'
  } finally {
    isBreaking.value = false
  }
}

function handleUndo(record: BreakRecord) {
  try {
    const result = window.services.undoBreak(record)
    if (result.success) {
      const name = record.targetName
      successMessage.value = '已撤回 ' + name + ' 的解散操作'
      breakResult.value = null
      loadHistory()
    } else {
      error.value = result.errors.join('; ')
    }
  } catch (err: any) {
    error.value = err.message || '撤回失败'
  }
}

function handleClearHistory() {
  window.services.clearHistory()
  history.value = []
}

function handleNewBreak() {
  breakResult.value = null
  successMessage.value = ''
  error.value = ''
  targetDir.value = ''
  scanResult.value = null
}

watch(() => props.enterAction, (action: any) => {
  if (action.type === 'files' && action.payload && action.payload.length > 0) {
    const filePath = action.payload[0].path
    loadDirectory(filePath)
  }
}, { immediate: true })

onMounted(() => {
  loadHistory()
})
</script>

<template>
  <div class="break-container">
    <div class="break-header">
      <span class="break-title">解散文件夹</span>
    </div>

    <div v-if="!targetDir && !breakResult" class="drop-zone" :class="{ 'drop-zone--active': isDragOver }"
      @dragover="handleDragOver" @dragleave="handleDragLeave" @drop="handleDrop">
      <div class="drop-zone-icon">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>
      <div class="drop-zone-text">拖拽文件夹到此处</div>
      <div class="drop-zone-hint">或点击下方按钮选择</div>
      <button class="btn btn-primary" @click="handleSelectFolder">选择文件夹</button>
    </div>

    <div v-if="targetDir && !breakResult" class="folder-bar">
      <div class="folder-bar-path" :title="targetDir">{{ targetDir }}</div>
      <button class="btn btn-ghost" @click="handleSelectFolder">更换</button>
    </div>

    <div v-if="isLoading" class="loading">
      <div class="loading-spinner"></div>
      <span>扫描文件夹中...</span>
    </div>

    <div v-if="error && !isLoading" class="message message--error">
      <span>{{ error }}</span>
      <button class="btn btn-ghost btn-small" @click="error = ''">关闭</button>
    </div>

    <div v-if="successMessage && !targetDir" class="message message--success">
      <span>{{ successMessage }}</span>
      <button class="btn btn-ghost btn-small" @click="handleNewBreak">继续解散</button>
    </div>

    <div v-if="targetDir && scanResult && !isLoading && !breakResult" class="options-bar">
      <div class="option-group">
        <span class="option-label">模式</span>
        <div class="toggle-group">
          <button class="toggle-btn" :class="{ 'toggle-btn--active': !recursive }"
            @click="setRecursive(false)">单层</button>
          <button class="toggle-btn" :class="{ 'toggle-btn--active': recursive }"
            @click="setRecursive(true)">递归</button>
        </div>
      </div>
      <div class="option-group">
        <span class="option-label">冲突</span>
        <select v-model="conflictStrategy" class="select">
          <option value="rename">自动重命名</option>
          <option value="overwrite">覆盖</option>
          <option value="skip">跳过</option>
        </select>
      </div>
    </div>

    <div v-if="scanResult && targetDir && !breakResult && !isLoading" class="preview">
      <div class="preview-summary-bar">
        <div class="summary-stat">
          <span class="summary-stat-value">{{ scanResult.totalFiles }}</span>
          <span class="summary-stat-label">文件</span>
        </div>
        <div class="summary-stat">
          <span class="summary-stat-value">{{ scanResult.totalDirs }}</span>
          <span class="summary-stat-label">文件夹</span>
        </div>
        <div class="summary-stat">
          <span class="summary-stat-value">{{ scanResult.totalFiles > 0 ? formatSize(scanResult.totalSize) : '--'
            }}</span>
          <span class="summary-stat-label">{{ scanResult.totalFiles > 0 ? '总计' : '仅子目录' }}</span>
        </div>
      </div>

      <div v-if="scanResult.totalFiles > 0 && scanResult.fileTypes.length > 0" class="preview-types">
        <span v-for="(t, i) in scanResult.fileTypes.slice(0, 6)" :key="i" class="type-badge">{{ t.ext || '(无扩展名)' }} {{
          t.count }}</span>
        <span v-if="scanResult.fileTypes.length > 6" class="type-badge type-badge--more">
          +{{ scanResult.fileTypes.length - 6 }}
        </span>
      </div>

      <div class="preview-compare">
        <div class="compare-side">
          <div class="compare-label">当前</div>
          <div class="compare-desc">{{ scanResult.totalFiles }} 个文件分布在 {{ scanResult.totalDirs || 1 }} 个目录中</div>
        </div>
        <div class="compare-arrow">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </div>
        <div class="compare-side compare-side--after">
          <div class="compare-label">之后</div>
          <div class="compare-desc">
            <template v-if="recursive">
              所有文件集中到父目录，所有子目录被清空删除
            </template>
            <template v-else>
              直接文件移到父目录，子目录结构保持不变
            </template>
          </div>
        </div>
      </div>

      <div v-if="previewFiles.items.length > 0" class="preview-section">
        <div class="preview-section-header">
          <span>文件列表</span>
          <span class="preview-section-count">{{ scanResult.totalFiles }}</span>
        </div>
        <div class="preview-list">
          <div v-for="(f, i) in previewFiles.items" :key="i" class="preview-row"
            :class="{ 'preview-row--nested': f.relativePath.indexOf('/') > -1 }">
            <span class="preview-row-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </span>
            <span class="preview-row-name" :title="f.relativePath">{{ f.relativePath }}</span>
            <span class="preview-row-size">{{ formatSize(f.size) }}</span>
          </div>
          <div v-if="previewFiles.remaining > 0" class="preview-more">
            <button class="btn btn-link" @click="showAllFiles = true">
              还有 {{ previewFiles.remaining }} 个文件...
            </button>
          </div>
        </div>
      </div>

      <div v-if="previewDirs.items.length > 0" class="preview-section">
        <div class="preview-section-header">
          <span>子目录列表</span>
          <span class="preview-section-count">{{ scanResult.totalDirs }}</span>
        </div>
        <div class="preview-list">
          <div v-for="(d, i) in previewDirs.items" :key="i" class="preview-row">
            <span class="preview-row-icon preview-row-icon--dir">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
              </svg>
            </span>
            <span class="preview-row-name" :title="d.name">{{ d.name }}</span>
            <span class="preview-row-meta">
              <template v-if="recursive">将被清空</template>
              <template v-else>将移到父目录</template>
            </span>
          </div>
          <div v-if="previewDirs.remaining > 0" class="preview-more">
            <button class="btn btn-link" @click="showAllDirs = true">
              还有 {{ previewDirs.remaining }} 个目录...
            </button>
          </div>
        </div>
      </div>

      <div v-if="scanResult.totalFiles === 0 && scanResult.totalDirs === 0" class="preview-empty">
        该文件夹中没有文件
      </div>
    </div>

    <div v-if="targetDir && scanResult && !breakResult && !isLoading" class="action-bar">
      <button class="btn btn-primary btn-action"
        :disabled="isBreaking || (scanResult.totalFiles === 0 && scanResult.totalDirs === 0)" @click="handleBreak">
        <span v-if="isBreaking" class="loading-spinner loading-spinner--small"></span>
        <span>{{ isBreaking ? '解散中...' : '解散文件夹' }}</span>
      </button>
    </div>

    <div v-if="history.length > 0 && !targetDir" class="history">
      <div class="history-header">
        <span class="history-title">历史记录</span>
        <button class="btn btn-ghost btn-small" @click="handleClearHistory">清空</button>
      </div>
      <div class="history-list">
        <div v-for="record in history" :key="record.id" class="history-item">
          <div class="history-item-info">
            <div class="history-item-name">{{ record.targetName }}</div>
            <div class="history-item-meta">
              {{ record.summary.totalMoved }} 个文件
              <template v-if="record.summary.totalDirsMoved > 0"> · {{ record.summary.totalDirsMoved }} 个目录</template>
              <template v-if="record.summary.totalDeleted > 0"> · 删除 {{ record.summary.totalDeleted }} 个</template>
              · {{ formatRelativeTime(record.timestamp) }}
            </div>
          </div>
          <button class="btn btn-undo" @click="handleUndo(record)">撤回</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.break-container {
  padding: 16px 20px 20px;
  min-height: 200px;
}

.break-header {
  margin-bottom: 16px;
}

.break-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}

.drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 36px 20px;
  border: 2px dashed var(--border);
  border-radius: var(--radius-lg);
  transition: border-color 0.2s, background 0.2s;
  cursor: default;
}

.drop-zone:hover {
  border-color: var(--primary);
  background: var(--primary-light);
}

.drop-zone--active {
  border-color: var(--primary);
  background: var(--primary-light);
}

.drop-zone-icon {
  color: var(--text-muted);
  margin-bottom: 12px;
}

.drop-zone--active .drop-zone-icon {
  color: var(--primary);
}

.drop-zone-text {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.drop-zone-hint {
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 16px;
}

.folder-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border-radius: var(--radius);
  margin-bottom: 12px;
}

.folder-bar-path {
  flex: 1;
  font-size: 13px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
}

.loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 20px;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 13px;
}

.loading-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

.loading-spinner--small {
  width: 14px;
  height: 14px;
  border-width: 1.5px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.message {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px;
  border-radius: var(--radius);
  font-size: 13px;
  margin-bottom: 12px;
}

.message--error {
  background: var(--danger-light);
  color: var(--danger);
}

.message--success {
  background: var(--success-light);
  color: var(--success);
}

.options-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border-radius: var(--radius);
  margin-bottom: 12px;
}

.option-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.option-label {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.toggle-group {
  display: flex;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.toggle-btn {
  padding: 4px 12px;
  font-size: 13px;
  background: transparent;
  color: var(--text-secondary);
  border-radius: 0;
  transition: background 0.15s, color 0.15s;
  cursor: pointer;
  border: none;
  outline: none;
}

.toggle-btn:not(:last-child) {
  border-right: 1px solid var(--border);
}

.toggle-btn.toggle-btn--active {
  background: var(--primary);
  color: var(--primary-text);
}

.select {
  padding: 4px 8px;
  font-size: 13px;
  border-radius: var(--radius-sm);
  min-width: 100px;
}

.preview {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  margin-bottom: 12px;
}

.preview-summary-bar {
  display: flex;
  gap: 0;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
}

.summary-stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 8px;
  text-align: center;
}

.summary-stat+.summary-stat {
  border-left: 1px solid var(--border);
}

.summary-stat-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
  line-height: 1.2;
}

.summary-stat-label {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.preview-types {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}

.type-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  white-space: nowrap;
}

.type-badge--more {
  background: transparent;
  color: var(--text-muted);
}

.preview-compare {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
}

.compare-side {
  flex: 1;
}

.compare-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 2px;
}

.compare-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.compare-arrow {
  flex-shrink: 0;
  color: var(--primary);
}

.preview-section {
  border-bottom: 1px solid var(--border);
}

.preview-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-secondary);
}

.preview-section-count {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 400;
}

.preview-list {
  max-height: 220px;
  overflow-y: auto;
}

.preview-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 12px;
  font-size: 13px;
  color: var(--text);
  min-height: 24px;
}

.preview-row:hover {
  background: var(--bg-secondary);
}

.preview-row--nested {
  padding-left: 28px;
}

.preview-row-icon {
  display: flex;
  flex-shrink: 0;
  color: var(--text-muted);
}

.preview-row-icon--dir {
  color: var(--primary);
}

.preview-row-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.preview-row-size {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.preview-row-meta {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-muted);
}

.preview-more {
  padding: 6px 12px;
  text-align: center;
}

.btn-link {
  background: none;
  border: none;
  padding: 0;
  font-size: 13px;
  color: var(--primary);
  cursor: pointer;
  text-decoration: none;
}

.btn-link:hover {
  color: var(--primary-hover);
}

.preview-empty {
  padding: 24px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

.action-bar {
  margin-bottom: 12px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  border-radius: var(--radius-sm);
  transition: background 0.15s, color 0.15s, box-shadow 0.15s;
}

.btn-primary {
  background: var(--primary);
  color: var(--primary-text);
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-hover);
}

.btn-action {
  width: 100%;
  padding: 10px;
  font-size: 15px;
}

.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  padding: 6px 12px;
  font-size: 13px;
}

.btn-ghost:hover {
  background: var(--bg-tertiary);
  color: var(--text);
}

.btn-small {
  padding: 4px 8px;
  font-size: 12px;
}

.btn-undo {
  background: transparent;
  color: var(--primary);
  padding: 4px 12px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid var(--primary);
  border-radius: var(--radius-sm);
}

.btn-undo:hover {
  background: var(--primary-light);
}

.history {
  border-top: 1px solid var(--border);
  padding-top: 12px;
  margin-top: 4px;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.history-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: var(--radius);
  transition: background 0.15s;
}

.history-item:hover {
  background: var(--bg-secondary);
}

.history-item-info {
  flex: 1;
  min-width: 0;
}

.history-item-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-item-meta {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}
</style>
