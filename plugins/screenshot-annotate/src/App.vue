<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

let dispose: (() => void) | null = null
let outDispose: (() => void) | null = null

// ── 偏好设置表单 ──
const colors = ['#e5484d', '#ff9d00', '#ffd400', '#3ec46d', '#19b6ff', '#7146ff', '#000000', '#ffffff']
const format = ref<'png' | 'jpg'>('png')
const setColor = ref('#e5484d')
const setLineWidth = ref(3)
const setDir = ref('')
const savedTip = ref('')

async function loadSettings() {
  const s = await window.services.getSettings()
  setColor.value = s.color
  setLineWidth.value = s.lineWidth
  format.value = s.format
  setDir.value = s.dir ?? ''
}
async function saveSettings() {
  await window.services.setSettings({
    color: setColor.value,
    lineWidth: Number(setLineWidth.value),
    format: format.value,
    dir: setDir.value.trim() ? setDir.value.trim() : null
  })
  savedTip.value = '已保存 ✓'
  setTimeout(() => (savedTip.value = ''), 1500)
}

async function launchCapture() {
  // 原生交互式框选（免桌面录屏权限）；回调返回选中区域图 + 选区屏幕坐标
  const anyZtools = window.ztools as unknown as {
    screenCapture: (cb: (image: string, bounds?: { x: number; y: number; width: number; height: number }) => void) => void
  }
  anyZtools.screenCapture((image, bounds) => {
    if (!image) return // 用户取消
    const b = bounds ?? { x: 80, y: 80, width: 0, height: 0 }
    window.services.openCaptureWindow({
      dataURL: image,
      x: b.x,
      y: b.y,
      width: b.width || undefined,
      height: b.height || undefined
    })
  })
}

/** 一键截图并直接钉到桌面（跳过标注） */
function launchPinDirect() {
  const anyZtools = window.ztools as unknown as {
    screenCapture: (cb: (image: string, bounds?: { x: number; y: number; width: number; height: number }) => void) => void
  }
  anyZtools.screenCapture((image, bounds) => {
    if (!image) return // 用户取消
    const b = bounds ?? { x: 80, y: 80, width: 0, height: 0 }
    window.services.openPinWindow({
      dataURL: image,
      x: b.x ?? undefined,
      y: b.y ?? undefined,
      width: b.width || undefined,
      height: b.height || undefined
    })
  })
}

function handleEnter(action: { code: string; payload?: unknown }) {
  if (action.code === 'ui.capture' || action.code === 'function.capture-copy') {
    void launchCapture()
  } else if (action.code === 'function.capture-pin') {
    void launchPinDirect()
  }
}

onMounted(() => {
  void loadSettings()
  const enterClean = window.ztools.onPluginEnter((action) => {
    handleEnter(action as { code: string; payload?: unknown })
  })
  if (typeof enterClean === 'function') dispose = enterClean
  const outClean = window.ztools.onPluginOut(() => {})
  if (typeof outClean === 'function') outDispose = outClean
})

onUnmounted(() => {
  dispose?.()
  outDispose?.()
})
</script>

<template>
  <div class="app-root">
    <div class="home-col">
      <div class="home-card">
        <img src="/logo.png" alt="logo" class="logo" />
        <h2>截图标注</h2>
        <p class="sub">按下快捷键或输入「截图」，开始框选截图</p>
        <fieldset class="guide">
          <legend>设置全局快捷键</legend>
          <ol>
            <li>点击 <code>设置</code> → <code>快捷键</code> → <code>全局快捷键</code></li>
            <li>把本插件「截图标注」绑定为 <code>Ctrl+Shift+A</code> → 任何窗口唤起框选标注</li>
            <li>把「截图并钉图」绑定为 <code>Ctrl+Shift+S</code> → 一键截图钉到桌面</li>
          </ol>
        </fieldset>
      </div>

      <div class="sett-card">
        <h3>偏好设置</h3>
        <label class="row">
          <span>默认颜色</span>
          <span class="swatches">
            <button
              v-for="c in colors"
              :key="c"
              class="swatch"
              :class="{ on: setColor === c }"
              :style="{ background: c }"
              @click="setColor = c"
            />
          </span>
        </label>
        <label class="row">
          <span>默认线宽</span>
          <select v-model.number="setLineWidth">
            <option :value="2">2</option>
            <option :value="3">3</option>
            <option :value="5">5</option>
            <option :value="8">8</option>
          </select>
        </label>
        <label class="row">
          <span>保存格式</span>
          <select v-model="format">
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
          </select>
        </label>
        <label class="row">
          <span>保存目录（留空=图片/Screenshots）</span>
          <input v-model="setDir" class="dir-input" placeholder="例：D:\截图" />
        </label>
        <div class="sett-actions">
          <button class="save-btn" @click="saveSettings">保存设置</button>
          <span v-if="savedTip" class="tip">{{ savedTip }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-root {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg, #f5f6f8);
  padding: 24px;
  box-sizing: border-box;
}
.home-col {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  max-width: 760px;
  flex-wrap: wrap;
  justify-content: center;
}
.home-card {
  text-align: center;
  background: var(--card, #fff);
  border-radius: 16px;
  padding: 32px 36px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.06);
  max-width: 420px;
  flex: 1 1 340px;
}
.sett-card {
  background: var(--card, #fff);
  border-radius: 16px;
  padding: 24px 28px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.06);
  max-width: 420px;
  flex: 1 1 340px;
  min-width: 300px;
}
.sett-card h3 {
  margin: 0 0 16px;
  font-size: 16px;
}
.logo {
  width: 64px;
  height: 64px;
  border-radius: 14px;
}
h2 {
  margin: 12px 0 4px;
  font-size: 20px;
}
.sub {
  color: #888;
  font-size: 13px;
  margin-bottom: 18px;
}
.guide {
  text-align: left;
  border: 1px solid #e2e5ea;
  border-radius: 8px;
  padding: 12px 14px;
}
.guide legend {
  padding: 0 6px;
  font-size: 12px;
  color: #666;
}
.guide ol {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: #444;
  line-height: 1.8;
}
code {
  background: #eef1f5;
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 12px;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 13px;
  color: #444;
}
.swatches {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.swatch {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.25);
  cursor: pointer;
  padding: 0;
}
.swatch.on {
  outline: 2px solid #4c8dff;
  outline-offset: 1px;
}
.row select,
.row input {
  padding: 5px 8px;
  border: 1px solid #d6dbe3;
  border-radius: 6px;
  font-size: 13px;
  background: #fff;
}
.dir-input {
  flex: 1;
  min-width: 150px;
}
.sett-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
}
.save-btn {
  border: none;
  background: #4c8dff;
  color: #fff;
  padding: 8px 18px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}
.save-btn:hover {
  background: #3b79e0;
}
.tip {
  color: #3ec46d;
  font-size: 13px;
}
</style>