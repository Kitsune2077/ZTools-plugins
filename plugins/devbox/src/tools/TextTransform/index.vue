<script lang="ts" setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'

type Mode = 'join' | 'split'

const inputText = ref('')
const outputText = ref('')
const mode = ref<Mode>('join')
const delimiter = ref(',')
const wrapperLeft = ref('"')
const wrapperRight = ref('"')
const stripWrapper = ref(true)

const delimiterPresets = [
  { label: ',', value: ',' },
  { label: '、', value: '、' },
  { label: '␣', value: ' ' },
  { label: ';', value: ';' },
  { label: '|', value: '|' },
  { label: '\\t', value: '\t' },
]

interface WrapperPreset {
  label: string
  left: string
  right: string
}

const wrapperPresets: WrapperPreset[] = [
  { label: '"', left: '"', right: '"' },
  { label: "'", left: "'", right: "'" },
  { label: '`', left: '`', right: '`' },
  { label: '()', left: '(', right: ')' },
  { label: '[]', left: '[', right: ']' },
  { label: '{}', left: '{', right: '}' },
  { label: '无', left: '', right: '' },
]

function isDelimiterActive(p: { value: string }): boolean {
  return delimiter.value === p.value
}

function isWrapperActive(p: WrapperPreset): boolean {
  return wrapperLeft.value === p.left && wrapperRight.value === p.right
}

const stats = computed(() => {
  if (!outputText.value) return null
  const inLines = inputText.value ? inputText.value.split(/\r?\n/).length : 0
  const outLines = outputText.value.split('\n').length
  return {
    inChars: inputText.value.length,
    outChars: outputText.value.length,
    inLines,
    outLines,
  }
})

function parseEscape(s: string): string {
  return s
    .replace(/\\\\/g, '\x00__BS')
    .replace(/\\t/g, '\t')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\x00__BS/g, '\\')
}

function transform() {
  const text = inputText.value
  if (!text.trim()) {
    outputText.value = ''
    return
  }
  const sep = parseEscape(delimiter.value)

  if (mode.value === 'join') {
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
    const wrapped = lines.map((line) => wrapperLeft.value + line + wrapperRight.value)
    outputText.value = wrapped.join(sep)
  } else {
    const parts = text.split(sep).filter((p) => p.trim() !== '')
    if (stripWrapper.value && (wrapperLeft.value || wrapperRight.value)) {
      const l = wrapperLeft.value
      const r = wrapperRight.value
      outputText.value = parts
        .map((p) => {
          let s = p.trim()
          if (l && s.startsWith(l)) s = s.slice(l.length)
          if (r && s.endsWith(r)) s = s.slice(0, s.length - r.length)
          return s
        })
        .join('\n')
    } else {
      outputText.value = parts.map((p) => p.trim()).join('\n')
    }
  }
}

function copyText(text: string) {
  const doCopy = (window as any).ztools?.copyText
    ? Promise.resolve((window as any).ztools.copyText(text))
    : navigator.clipboard.writeText(text)
  doCopy
    .then(() => ElMessage.success({ message: '已复制到剪贴板', duration: 800 }))
    .catch(() => ElMessage.error({ message: '复制失败', duration: 1000 }))
}

function clearAll() {
  inputText.value = ''
  outputText.value = ''
}

if ((window as any).ztools?.onPluginEnter) {
  ;(window as any).ztools.onPluginEnter(() => {
    try { (window as any).ztools.setExpendHeight(600) } catch (_) {}
  })
}
</script>

<template>
  <div class="text-transform">
    <h2>文本转换</h2>
    <p class="desc">多行与单行文本互转，支持自定义分隔符和包裹符</p>

    <div class="toolbar">
      <div class="toolbar-left">
        <el-button link size="small" :class="{ active: mode === 'join' }" @click="mode = 'join'">多行→一行</el-button>
        <el-button link size="small" :class="{ active: mode === 'split' }" @click="mode = 'split'">一行→多行</el-button>
      </div>
      <div class="toolbar-right">
        <el-button link type="primary" size="small" @click="transform" :disabled="!inputText.trim()">转换</el-button>
        <el-button link type="primary" size="small" @click="clearAll" :disabled="!inputText && !outputText">清空</el-button>
      </div>
    </div>

    <div class="preset-row">
      <span class="preset-label">分隔符</span>
      <span
        v-for="p in delimiterPresets"
        :key="p.label"
        class="preset-tag"
        :class="{ active: isDelimiterActive(p) }"
        @click="delimiter = p.value"
      >{{ p.label }}</span>
      <span class="custom-hint">自定义</span>
      <el-input v-model="delimiter" size="small" style="width:60px" placeholder="," />
    </div>

    <div class="preset-row">
      <span class="preset-label">包裹符</span>
      <span
        v-for="p in wrapperPresets"
        :key="p.label"
        class="preset-tag"
        :class="{ active: isWrapperActive(p) }"
        @click="wrapperLeft = p.left; wrapperRight = p.right"
      >{{ p.label }}</span>
      <span class="custom-hint">自定义左</span>
      <el-input v-model="wrapperLeft" size="small" style="width:40px" placeholder='"' />
      <span class="custom-hint">右</span>
      <el-input v-model="wrapperRight" size="small" style="width:40px" placeholder='"' />
      <el-checkbox v-if="mode === 'split'" v-model="stripWrapper" size="small" style="margin-left:8px">去除包裹</el-checkbox>
    </div>

    <div class="input-section">
      <el-input
        v-model="inputText"
        type="textarea"
        :rows="8"
        :autosize="{ minRows: 5, maxRows: 14 }"
        :placeholder="mode === 'join' ? '在此粘贴多行文本，每行将被包裹后合并...' : '在此粘贴一行文本，将按分隔符拆分为多行...'"
        resize="vertical"
        clearable
      />
    </div>

    <div v-if="outputText" class="result-section">
      <div class="result-header">
        <span class="result-label">转换结果</span>
        <el-button size="small" type="primary" plain @click="copyText(outputText)">复制</el-button>
      </div>
      <div class="result-box">{{ outputText }}</div>
    </div>

    <div v-if="stats" class="stats-bar">
      <span>输入：<strong>{{ stats.inChars }}</strong> 字符 · <strong>{{ stats.inLines }}</strong> 行</span>
      <span class="stat-arrow">→</span>
      <span>输出：<strong>{{ stats.outChars }}</strong> 字符 · <strong>{{ stats.outLines }}</strong> 行</span>
    </div>
  </div>
</template>

<style scoped>
.text-transform { padding: 12px; max-width: 720px; margin: 0 auto; font-size: 13px; }
h2 { margin: 0 0 4px; font-size: 20px; font-weight: 600; }
.desc { color: #909399; margin: 0 0 12px; font-size: 13px; }

.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.toolbar-left { display: flex; align-items: center; gap: 4px; }
.toolbar-right { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.toolbar :deep(.el-button.is-link) { color: #909399; }
.toolbar :deep(.el-button.is-link.active) { color: #667eea; font-weight: 600; }

.preset-row { display: flex; align-items: center; gap: 4px; margin-bottom: 8px; flex-wrap: wrap; }
.preset-label { font-size: 12px; color: #909399; white-space: nowrap; margin-right: 4px; }
.preset-tag { display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 22px; padding: 0 5px; font-size: 12px; border-radius: 4px; cursor: pointer; border: 1px solid #dcdfe6; color: #606266; background: var(--bg-main, #fff); user-select: none; transition: all 0.15s; }
.preset-tag:hover { border-color: #667eea; color: #667eea; }
.preset-tag.active { border-color: #667eea; background: #667eea; color: #fff; }
.custom-hint { font-size: 11px; color: #909399; margin-left: 4px; }
.preset-row :deep(.el-input__wrapper) { box-shadow: 0 0 0 1px #dcdfe6 inset; }
.preset-row :deep(.el-checkbox__label) { font-size: 12px; }

.input-section { margin-bottom: 12px; }
.input-section :deep(.el-textarea__inner) { font-family: 'Consolas','Courier New',monospace; font-size: 13px; line-height: 1.5; }

.result-section { background: var(--bg-card, #f5f7ff); border: 1px solid var(--border-color, #e5e5e5); border-radius: 8px; padding: 12px; }
.result-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.result-label { font-size: 13px; font-weight: 500; color: #606266; }
.result-box { font-family: 'Consolas','Courier New',monospace; font-size: 13px; line-height: 1.6; word-break: break-all; white-space: pre-wrap; padding: 10px 12px; background: var(--bg-main, #fff); border: 1px solid var(--border-color, #dcdfe6); border-radius: 6px; max-height: 400px; overflow-y: auto; color: var(--text-primary, #333); }

.stats-bar { display: flex; align-items: center; gap: 12px; padding: 8px 12px; background: var(--bg-card, #f5f7fa); border-radius: 6px; margin-top: 12px; font-size: 12px; color: #606266; flex-wrap: wrap; }
.stats-bar strong { color: #333; }
.stat-arrow { color: #909399; font-size: 14px; }

@media (prefers-color-scheme: dark) {
  h2 { color: #e0e0e0; }
  .desc { color: #8a8a8a; }
  .preset-label { color: #8a8a8a; }
  .custom-hint { color: #8a8a8a; }
  .preset-tag { border-color: #444; color: #aaa; background: #2c2c2c; }
  .preset-tag:hover { border-color: #8ba4f7; color: #8ba4f7; }
  .preset-tag.active { border-color: #8ba4f7; background: #8ba4f7; color: #fff; }
  .toolbar :deep(.el-button.is-link) { color: #8a8a8a; }
  .toolbar :deep(.el-button.is-link.active) { color: #8ba4f7; }
  .preset-row :deep(.el-input__wrapper) { background: #2c2c2c; box-shadow: 0 0 0 1px #444 inset; }
  .result-section { background: #2c2c2c; border-color: #444; }
  .result-box { background: #1e1e1e; border-color: #444; color: #ddd; }
  .result-label { color: #aaa; }
  .stats-bar { background: #2c2c2c; color: #aaa; }
  .stats-bar strong { color: #ddd; }
}
</style>