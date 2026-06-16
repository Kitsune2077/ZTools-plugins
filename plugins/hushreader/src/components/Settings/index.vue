<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useConfigStore, type ReaderConfig } from '../../stores/config'

const emit = defineEmits<{ close: [] }>()

const configStore = useConfigStore()
const cfg = computed(() => configStore.config)

const activeTab = ref<'hushreader' | 'function' | 'other'>('hushreader')

const FONT_OPTIONS = [
  { label: '系统默认', value: 'system-ui, -apple-system, sans-serif' },
  { label: '衬线体', value: 'Georgia, "Times New Roman", serif' },
  { label: '思源黑体', value: '"Source Han Sans SC", sans-serif' },
  { label: '楷体', value: '"KaiTi", "楷体", serif' },
  { label: '仿宋', value: '"FangSong", "仿宋", serif' },
]

const isAddingFont = ref(false)
const newFontInput = ref('')
const fontBeforeAdd = ref('')

const allFontOptions = computed(() => {
  const customFonts = cfg.value.other.customFonts || []
  const customOptions = customFonts.map(f => ({ label: f, value: f }))
  return [...FONT_OPTIONS, ...customOptions]
})

function startAddFont() {
  fontBeforeAdd.value = cfg.value.hushreader.fontFamily
  isAddingFont.value = true
  newFontInput.value = ''
}

function confirmAddFont() {
  const fontName = newFontInput.value.trim()
  if (!fontName) {
    isAddingFont.value = false
    cfg.value.hushreader.fontFamily = fontBeforeAdd.value
    return
  }
  if (!cfg.value.other.customFonts) {
    cfg.value.other.customFonts = []
  }
  if (!cfg.value.other.customFonts.includes(fontName)) {
    cfg.value.other.customFonts.push(fontName)
  }
  cfg.value.hushreader.fontFamily = fontName
  isAddingFont.value = false
  newFontInput.value = ''
}

function cancelAddFont() {
  isAddingFont.value = false
  cfg.value.hushreader.fontFamily = fontBeforeAdd.value
  newFontInput.value = ''
}

function removeCustomFont(fontName: string) {
  if (cfg.value.other.customFonts) {
    cfg.value.other.customFonts = cfg.value.other.customFonts.filter(f => f !== fontName)
  }
  if (cfg.value.hushreader.fontFamily === fontName) {
    cfg.value.hushreader.fontFamily = FONT_OPTIONS[0].value
  }
}

let originalConfig: ReaderConfig | null = null

function save() {
  configStore.save()
  emit('close')
}

function cancel() {
  if (originalConfig) {
    configStore.config = JSON.parse(JSON.stringify(originalConfig))
  }
  emit('close')
}

function resetDefault() {
  showResetConfirm.value = true
}

function confirmReset() {
  configStore.resetToDefault()
  showResetConfirm.value = false
}

const showResetConfirm = ref(false)

watch(() => configStore.config, () => {
  if (!originalConfig) {
    originalConfig = JSON.parse(JSON.stringify(configStore.config))
  }
}, { immediate: true })

watch(() => cfg.value.hushreader.fontFamily, (newVal) => {
  if (newVal === '__add__') {
    startAddFont()
  }
})

// Key binding capture
function getKeyBinding(e: KeyboardEvent): string | null {
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('ctrl')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')
  const key = e.key.toLowerCase()
  if (!['control', 'meta', 'alt', 'shift'].includes(key)) {
    parts.push(key === ' ' ? 'space' : key)
  }
  return parts.length > 0 ? parts.join('+') : null
}

// Multi-key binding helpers for function tab
function addKey(arr: string[], key: string) {
  if (!arr.includes(key)) arr.push(key)
}
function removeKey(arr: string[], idx: number) {
  arr.splice(idx, 1)
}

const capturingFor = ref<string | null>(null)
const capturedKey = ref('')

function startCapture(field: string) {
  capturingFor.value = field
  capturedKey.value = ''
}

function onKeyCapture(e: KeyboardEvent, field: string) {
  e.preventDefault()
  const b = getKeyBinding(e)
  if (!b) return
  capturedKey.value = b
}

function commitCapture(targetArr: string[]) {
  if (capturedKey.value && !targetArr.includes(capturedKey.value)) {
    targetArr.push(capturedKey.value)
  }
  capturingFor.value = null
  capturedKey.value = ''
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="settings-box">
      <!-- Header -->
      <div class="settings-header">
        <h2 class="settings-title">插件设置</h2>
        <button class="close-btn" @click="emit('close')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <!-- Tabs -->
      <div class="tab-bar">
        <button class="tab-btn" :class="{ active: activeTab === 'hushreader' }" @click="activeTab = 'hushreader'">阅读窗口</button>
        <button class="tab-btn" :class="{ active: activeTab === 'function' }" @click="activeTab = 'function'">功能设置</button>
        <button class="tab-btn" :class="{ active: activeTab === 'other' }" @click="activeTab = 'other'">其他设置</button>
      </div>

      <!-- Body -->
      <div class="settings-body">

        <!-- ===== 沉浸式阅读窗口 ===== -->
        <div v-if="activeTab === 'hushreader'" class="settings-grid">

          <div class="section-label">字体</div>

          <div class="setting-row">
            <label>字体</label>
            <div class="input-group">
              <select v-if="!isAddingFont" v-model="cfg.hushreader.fontFamily" class="select" style="flex: 1">
                <option v-for="f in allFontOptions" :key="f.value" :value="f.value">{{ f.label }}</option>
                <option value="__add__">+ 添加自定义字体</option>
              </select>
              <input
                v-else
                v-model="newFontInput"
                class="text-input"
                placeholder="输入字体名称..."
                @keyup.enter="confirmAddFont"
                @keyup.esc="cancelAddFont"
                style="flex: 1"
              />
              <button v-if="isAddingFont" class="btn-primary" @click="confirmAddFont" style="padding: 4px 10px">确定</button>
              <button v-if="isAddingFont" class="btn-secondary" @click="cancelAddFont" style="padding: 4px 10px">取消</button>
            </div>
          </div>

          <div class="setting-row">
            <label>字体大小</label>
            <div class="input-group">
              <input type="range" min="12" max="36" v-model.number="cfg.hushreader.fontSize" class="slider" />
              <span class="badge">{{ cfg.hushreader.fontSize }}px</span>
            </div>
          </div>

          <div class="setting-row">
            <label>行间距</label>
            <div class="input-group">
              <input type="range" min="1.2" max="3" step="0.1" v-model.number="cfg.hushreader.lineHeight" class="slider" />
              <span class="badge">{{ cfg.hushreader.lineHeight.toFixed(1) }}</span>
            </div>
          </div>

          <div class="setting-row">
            <label>字间距</label>
            <div class="input-group">
              <input type="range" min="0" max="8" step="0.5" v-model.number="cfg.hushreader.letterSpacing" class="slider" />
              <span class="badge">{{ cfg.hushreader.letterSpacing }}px</span>
            </div>
          </div>

          <div class="divider"></div>
          <div class="section-label">窗口</div>

          <div class="setting-row">
            <label>窗口宽度</label>
            <div class="input-group">
              <input type="range" min="280" max="1180" v-model.number="cfg.hushreader.hushreaderWidth" class="slider" />
              <span class="badge">{{ cfg.hushreader.hushreaderWidth }}px</span>
            </div>
          </div>

          <div class="setting-row">
            <label>窗口高度</label>
            <div class="input-group">
              <input type="range" min="22" max="160" v-model.number="cfg.hushreader.hushreaderHeight" class="slider" />
              <span class="badge">{{ cfg.hushreader.hushreaderHeight }}px</span>
            </div>
          </div>

          <div class="setting-row">
            <label>透明度</label>
            <div class="input-group">
              <input type="range" min="10" max="100" v-model.number="cfg.hushreader.opacity" class="slider" />
              <span class="badge">{{ cfg.hushreader.opacity }}%</span>
            </div>
          </div>

          <div class="setting-row">
            <label>背景透明度</label>
            <div class="input-group">
              <input type="range" min="0" max="100" v-model.number="cfg.hushreader.bgOpacity" class="slider" />
              <span class="badge">{{ cfg.hushreader.bgOpacity }}%</span>
            </div>
          </div>

          <div class="divider"></div>
          <div class="section-label">颜色</div>

          <div class="setting-row">
            <label>背景颜色</label>
            <div class="input-group">
              <input type="color" v-model="cfg.hushreader.bgColor" class="color-picker" />
              <input
                type="text"
                v-model="cfg.hushreader.bgColor"
                class="color-input"
                placeholder="#16191c"
                pattern="^#[0-9A-Fa-f]{6}$"
              />
            </div>
          </div>

          <div class="setting-row">
            <label>文字颜色</label>
            <div class="input-group">
              <input type="color" v-model="cfg.hushreader.textColor" class="color-picker" />
              <input
                type="text"
                v-model="cfg.hushreader.textColor"
                class="color-input"
                placeholder="#cccccc"
                pattern="^#[0-9A-Fa-f]{6}$"
              />
            </div>
          </div>

          <div class="divider"></div>
          <div class="section-label">显示</div>

          <div class="setting-row">
            <label>显示进度信息</label>
            <label class="toggle">
              <input type="checkbox" v-model="cfg.hushreader.showHushreaderMeta" />
              <span class="toggle-track"></span>
            </label>
          </div>

          <div class="setting-row" v-if="cfg.hushreader.showHushreaderMeta">
            <label>进度显示方式</label>
            <select v-model="cfg.hushreader.progressMode" class="select">
              <option value="chapter">章节进度 (3/20)</option>
              <option value="percent">阅读百分比 (45%)</option>
            </select>
          </div>
        </div>

        <!-- ===== 功能设置 ===== -->
        <div v-if="activeTab === 'function'" class="settings-grid">

          <div class="section-label">翻页控制</div>

          <div class="setting-row">
            <label>鼠标移出隐藏</label>
            <label class="toggle">
              <input type="checkbox" v-model="cfg.hushreader.hideOnMouseLeave" />
              <span class="toggle-track"></span>
            </label>
          </div>

          <div class="setting-row">
            <label>滚轮翻页</label>
            <label class="toggle">
              <input type="checkbox" v-model="cfg.hushreader.wheelTurnPage" />
              <span class="toggle-track"></span>
            </label>
          </div>

          <div class="setting-row">
            <label>上一页快捷键</label>
            <div class="input-group">
              <input
                class="key-input"
                :value="cfg.hushreader.prevPageKey"
                @keydown.prevent="(e: KeyboardEvent) => { const b = getKeyBinding(e); if (b) cfg.hushreader.prevPageKey = b }"
                placeholder="按下按键..."
                readonly
              />
            </div>
          </div>

          <div class="setting-row">
            <label>下一页快捷键</label>
            <div class="input-group">
              <input
                class="key-input"
                :value="cfg.hushreader.nextPageKey"
                @keydown.prevent="(e: KeyboardEvent) => { const b = getKeyBinding(e); if (b) cfg.hushreader.nextPageKey = b }"
                placeholder="按下按键..."
                readonly
              />
            </div>
          </div>

          <div class="divider"></div>
          <div class="section-label">自动翻页</div>

          <div class="setting-row">
            <label>自动翻页</label>
            <label class="toggle">
              <input type="checkbox" v-model="cfg.hushreader.autoFlipEnabled" />
              <span class="toggle-track"></span>
            </label>
          </div>

          <div class="setting-row" v-if="cfg.hushreader.autoFlipEnabled">
            <label>翻页间隔</label>
            <div class="input-group">
              <input type="number" min="1000" max="60000" step="500" v-model.number="cfg.hushreader.autoFlipInterval" class="number-input" />
              <span class="unit">ms</span>
            </div>
          </div>

          <div class="setting-row" v-if="cfg.hushreader.autoFlipEnabled">
            <label>连续翻页</label>
            <label class="toggle">
              <input type="checkbox" v-model="cfg.hushreader.continuousFlip" />
              <span class="toggle-track"></span>
            </label>
          </div>

          <div class="divider"></div>
          <div class="section-label">阅读功能</div>

          <div class="setting-row">
            <label>分页模式</label>
            <select v-model="cfg.function.pageMode" class="select">
              <option value="adaptive">自适应（按窗口高度）</option>
              <option value="fixed">固定行数</option>
            </select>
          </div>

          <div class="setting-row" v-if="cfg.function.pageMode === 'fixed'">
            <label>每页行数</label>
            <div class="input-group">
              <input type="number" min="1" max="30" v-model.number="cfg.function.pageLines" class="number-input" />
              <span class="unit">行</span>
            </div>
          </div>

          <div class="setting-row">
            <label>窗口可拖动</label>
            <label class="toggle">
              <input type="checkbox" v-model="cfg.function.windowMovable" />
              <span class="toggle-track"></span>
            </label>
          </div>
        </div>

        <!-- ===== 其他设置 ===== -->
        <div v-if="activeTab === 'other'" class="settings-grid">

          <div class="section-label">书架</div>

          <div class="setting-row">
            <label>列表书架模式</label>
            <label class="toggle">
              <input type="checkbox" v-model="cfg.other.listMode" />
              <span class="toggle-track"></span>
            </label>
          </div>

          <div class="divider"></div>
          <div class="section-label">解析</div>

          <div class="setting-row" style="align-items: flex-start; flex-direction: column; gap: 6px;">
            <label>TXT 章节识别正则</label>
            <input
              v-model="cfg.other.chapterRegex"
              class="text-input full-width"
              placeholder="留空使用默认规则（第X章...）"
            />
            <p class="hint" style="margin:0">支持标准 JavaScript 正则语法，EPUB 使用内置章节标识</p>
          </div>

          <div class="divider"></div>
          <div class="section-label">自定义字体</div>

          <div v-if="cfg.other.customFonts && cfg.other.customFonts.length > 0" class="setting-row" style="align-items: flex-start; flex-direction: column; gap: 6px;">
            <label>已添加的字体</label>
            <div class="custom-fonts-list">
              <div v-for="font in cfg.other.customFonts" :key="font" class="custom-font-item">
                <span class="custom-font-name">{{ font }}</span>
                <button class="btn-ghost" @click="removeCustomFont(font)" style="padding: 2px 8px; font-size: 12px">删除</button>
              </div>
            </div>
          </div>
          <div v-else class="setting-row">
            <label>已添加的字体</label>
            <span class="badge" style="font-size: 12px">暂无自定义字体</span>
          </div>

        </div>
      </div>

      <!-- Footer -->
      <div class="settings-footer">
        <button class="btn-ghost" @click="resetDefault">恢复默认设置</button>
        <div style="flex: 1"></div>
        <button class="btn-secondary" @click="cancel">取消</button>
        <button class="btn-primary" @click="save">保存</button>
      </div>
    </div>

    <!-- Reset confirm -->
    <div v-if="showResetConfirm" class="confirm-overlay" @click.self="showResetConfirm = false">
      <div class="confirm-box">
        <p>确定恢复所有默认设置吗？此操作不可撤销。</p>
        <div class="confirm-actions">
          <button class="btn-secondary" @click="showResetConfirm = false">取消</button>
          <button class="btn-danger" @click="confirmReset">恢复默认</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(28, 25, 23, 0.3);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 8000;
  animation: fade-in 0.15s var(--ease-out);
}

.settings-box {
  background: var(--c-surface-overlay);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-xl);
  width: 520px;
  max-width: 96vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-xl);
  animation: slide-up 0.2s var(--ease-out);
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px 16px;
  border-bottom: 1px solid var(--c-border);
  flex-shrink: 0;
}

.settings-title {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
  color: var(--c-ink-tertiary);
  transition: background 0.12s var(--ease-out), color 0.12s var(--ease-out);
}
.close-btn:hover {
  background: var(--c-surface-sunken);
  color: var(--c-ink);
}

.tab-bar {
  display: flex;
  gap: 0;
  padding: 0 22px;
  border-bottom: 1px solid var(--c-border);
  flex-shrink: 0;
}

.tab-btn {
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 500;
  color: var(--c-ink-tertiary);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.15s var(--ease-out), border-color 0.15s var(--ease-out);
}
.tab-btn:hover { color: var(--c-ink-secondary); }
.tab-btn.active {
  color: var(--c-accent);
  border-bottom-color: var(--c-accent);
}

.settings-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 22px;
}

.settings-grid {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.section-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--c-ink-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 10px 0 6px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  gap: 16px;
  min-height: 36px;
}

.setting-row > label:first-child {
  font-size: 13px;
  color: var(--c-ink);
  flex-shrink: 0;
  min-width: 100px;
}

.input-group {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.slider {
  width: 140px;
  accent-color: var(--c-accent);
  cursor: pointer;
}

.badge {
  font-size: 12px;
  color: var(--c-ink-tertiary);
  min-width: 40px;
  text-align: right;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

.badge.mono { font-family: var(--font-mono); min-width: 60px; }

.select {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  color: var(--c-ink);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.15s var(--ease-out), box-shadow 0.15s var(--ease-out);
}
.select:focus {
  border-color: var(--c-accent);
  box-shadow: 0 0 0 3px var(--c-accent-soft);
}

.color-picker {
  width: 32px;
  height: 26px;
  border: 1px solid var(--c-border);
  border-radius: var(--radius-xs);
  padding: 2px;
  background: none;
  cursor: pointer;
}

.color-input {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  color: var(--c-ink);
  border-radius: var(--radius-sm);
  padding: 5px 8px;
  font-size: 12px;
  font-family: var(--font-mono);
  width: 72px;
  transition: border-color 0.15s var(--ease-out), box-shadow 0.15s var(--ease-out);
}
.color-input:focus {
  border-color: var(--c-accent);
  box-shadow: 0 0 0 3px var(--c-accent-soft);
}

.key-input {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  color: var(--c-ink);
  border-radius: var(--radius-sm);
  padding: 5px 10px;
  font-size: 12px;
  font-family: var(--font-mono);
  width: 140px;
  cursor: pointer;
  transition: border-color 0.15s var(--ease-out), box-shadow 0.15s var(--ease-out);
}
.key-input:focus {
  border-color: var(--c-accent);
  box-shadow: 0 0 0 3px var(--c-accent-soft);
}

.number-input {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  color: var(--c-ink);
  border-radius: var(--radius-sm);
  padding: 5px 10px;
  font-size: 13px;
  width: 80px;
  transition: border-color 0.15s var(--ease-out), box-shadow 0.15s var(--ease-out);
}
.number-input:focus {
  border-color: var(--c-accent);
  box-shadow: 0 0 0 3px var(--c-accent-soft);
}

.unit { font-size: 12px; color: var(--c-ink-tertiary); }

.text-input {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  color: var(--c-ink);
  border-radius: var(--radius-sm);
  padding: 7px 12px;
  font-size: 13px;
  transition: border-color 0.15s var(--ease-out), box-shadow 0.15s var(--ease-out);
}
.text-input:focus {
  border-color: var(--c-accent);
  box-shadow: 0 0 0 3px var(--c-accent-soft);
}
.full-width { width: 100%; }

.hint { font-size: 11px; color: var(--c-ink-tertiary); margin: 0 0 6px; }

.toggle {
  position: relative;
  display: flex;
  align-items: center;
  cursor: pointer;
}
.toggle input { position: absolute; opacity: 0; width: 0; height: 0; }
.toggle-track {
  width: 36px;
  height: 20px;
  background: var(--c-border-strong);
  border-radius: var(--radius-full);
  transition: background 0.2s var(--ease-out);
  position: relative;
}
.toggle-track::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: var(--c-ink-inverse);
  border-radius: 50%;
  transition: transform 0.2s var(--ease-out);
  box-shadow: 0 1px 3px rgba(28, 25, 23, 0.15);
}
.toggle input:checked + .toggle-track { background: var(--c-accent); }
.toggle input:checked + .toggle-track::after { transform: translateX(16px); }

.divider { height: 1px; background: var(--c-border); margin: 10px 0 6px; }

.settings-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 22px;
  border-top: 1px solid var(--c-border);
  flex-shrink: 0;
}

.btn-primary, .btn-secondary, .btn-ghost, .btn-danger {
  padding: 8px 18px;
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
  border: 1px solid var(--c-border);
}
.btn-secondary:hover { background: var(--c-border); }
.btn-ghost {
  color: var(--c-ink-tertiary);
  padding-left: 0;
}
.btn-ghost:hover { color: var(--c-ink); }
.btn-danger {
  background: var(--c-danger);
  color: var(--c-ink-inverse);
}
.btn-danger:hover { opacity: 0.85; }

.custom-fonts-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.custom-font-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--c-surface-sunken);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-sm);
}

.custom-font-name {
  font-size: 12px;
  color: var(--c-ink);
  font-family: var(--font-mono);
}

.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(28, 25, 23, 0.3);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9000;
  animation: fade-in 0.12s var(--ease-out);
}
.confirm-box {
  background: var(--c-surface-overlay);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-lg);
  padding: 24px;
  min-width: 300px;
  box-shadow: var(--shadow-xl);
  animation: slide-up 0.15s var(--ease-out);
}
.confirm-box p { margin: 0 0 20px; font-size: 14px; line-height: 1.6; }
.confirm-actions { display: flex; gap: 8px; justify-content: flex-end; }
</style>
