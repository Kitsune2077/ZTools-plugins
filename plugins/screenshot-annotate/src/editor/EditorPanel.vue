<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { EditorController } from './annotation-controller'
import type { ToolKind } from './annotations'

const props = defineProps<{
  dataUrl: string
  width: number
  height: number
  onCopy: (dataURL: string) => void
  onSave: (dataURL: string) => void
  onPin?: (dataURL: string) => void
  onClose: () => void
}>()

const canvasRef = ref<HTMLCanvasElement>()
const stageRef = ref<HTMLElement>()
let ctrl: EditorController | null = null
let source: HTMLImageElement | null = null

// ── 画布视图变换（平移/缩放）。canvas 固有尺寸=图片像素，CSS transform 负责显示缩放与位移。
//    原点为变换中心，getBoundingClientRect 已含变换，localPoint 用 r.width/cv.width 还原 → 坐标映射始终正确。
const view = reactive({ scale: 1, tx: 0, ty: 0 })
let fit = 1 // 当前恰好铺满窗口的基础缩放（随窗口尺寸变化）
let ro: ResizeObserver | null = null

function applyView() {
  const cv = canvasRef.value
  if (cv) {
    cv.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`
  }
}
function recomputeFit() {
  const stage = stageRef.value
  const cv = canvasRef.value
  if (!stage || !cv || cv.width === 0) return
  const sw = stage.clientWidth
  const sh = stage.clientHeight
  if (!sw || !sh) return
  // 基础缩放 = 铺满；保留当前 zoom 比例 -> 实际 scale = fit * zoomRatio
  const newFit = Math.min(sw / cv.width, sh / cv.height)
  const zoomRatio = view.scale / fit
  fit = newFit
  view.scale = newFit * zoomRatio
  applyView()
}
function zoomBy(factor: number) {
  const stage = stageRef.value
  if (!stage) return
  const min = Math.min(fit * 0.2, 0.1)
  view.scale = Math.max(min, Math.min(fit * 8, view.scale * factor))
  applyView()
}

// 主预览画布：图片像素 = canvas.width，CSS 显示用 contain 缩放
// 工具箱
const tools: { kind: ToolKind; label: string }[] = [
  { kind: 'select', label: '选择/移动' },
  { kind: 'rect', label: '矩形' },
  { kind: 'ellipse', label: '圆形/椭圆' },
  { kind: 'arrow', label: '箭头' },
  { kind: 'pen', label: '画笔' },
  { kind: 'text', label: '文字' },
  { kind: 'mosaic', label: '马赛克' },
  { kind: 'line', label: '直线' },
  { kind: 'highlight', label: '高亮' }
]
/** 每个工具按钮的 SVG path（24×24，stroke 线性） */
const iconPath: Record<ToolKind, string[]> = {
  select: ['M3 3 L21 12 L12.5 13.5 L11 21 Z'],
  pen: ['M3 16 L15 4 L20 4 L20 9 L8 21 L3 21 Z', 'M13 6 L18 11'],
  line: ['M4 20 L20 4'],
  arrow: ['M4 20 L19 5', 'M10 5 H19 V14'],
  rect: ['M5 5 H19 V19 H5 Z'],
  ellipse: ['M12 4 C18.5 4 21 8.5 21 12 C21 15.5 18.5 20 12 20 C5.5 20 3 15.5 3 12 C3 8.5 5.5 4 12 4 Z'],
  highlight: ['M5 6 L19 3 L20.5 8 L6.5 11 Z'],
  text: ['M5 5 H19', 'M12 5 V19'],
  mosaic: ['M6 6 H12 V12 H6 Z', 'M12 6 H18 V12 H12 Z', 'M6 12 H12 V18 H6 Z', 'M12 12 H18 V18 H12 Z']
}
const colors = ['#e5484d', '#ff9d00', '#ffd400', '#3ec46d', '#19b6ff', '#7146ff', '#000000', '#ffffff']
const lineWidths = [2, 4, 6]
const currentTool = ref<ToolKind>('select')
const color = ref('#e5484d')
const lineWidth = ref(3)
const fill = ref(false)
const textSize = ref(28)
const textBold = ref(false)
const textSizes = [16, 20, 28, 36, 48]
/** 当前选中了文字标注（控制工具栏字号/粗体控件显示） */
const selectedIsText = ref(false)
const mosaicShape = ref<'rect' | 'round'>('rect')
const mosaicSizes = [10, 14, 20, 28, 40]
const mosaicCell = ref(14)
const canUndo = ref(false)
const canRedo = ref(false)

// 固定默认值（无可视化设置界面）
const DEFAULT_COLOR = '#e5484d'
const DEFAULT_LINE_WIDTH = 3

// 文字输入浮层
const textInputRef = ref<HTMLTextAreaElement>()

function undo() {
  ctrl?.undo()
  canUndo.value = !!ctrl?.canUndo
  canRedo.value = !!ctrl?.canRedo
}
function redo() {
  ctrl?.redo()
  canUndo.value = !!ctrl?.canUndo
  canRedo.value = !!ctrl?.canRedo
}
function pickTool(t: ToolKind) {
  currentTool.value = t
  ctrl?.setTool(t)
}
function pickColor(c: string) {
  color.value = c
  ctrl?.setColor(c)
  applyStyleToSelectedText({ color: c })
}
function pickWidth(w: number) {
  lineWidth.value = w
  ctrl?.setLineWidth(w)
}
function toggleFill() {
  fill.value = !fill.value
  ctrl?.setFill(fill.value)
}
function pickMosaicShape(s: 'rect' | 'round') {
  mosaicShape.value = s
  ctrl?.setMosaicShape(s)
}
function pickMosaicCell(c: number) {
  mosaicCell.value = c
  ctrl?.setMosaicCell(c)
}
function pickTextSize(s: number) {
  textSize.value = s
  ctrl?.setTextSize(s)
  applyStyleToSelectedText({ size: s })
}
function pickTextBold() {
  textBold.value = !textBold.value
  ctrl?.setTextBold(textBold.value)
  applyStyleToSelectedText({ bold: textBold.value })
}

/** 若选中了文字，把样式变更应用到它；新建文字仍由 setTextSize/setTextBold/setColor 覆盖默认值 */
function applyStyleToSelectedText(partial: { size?: number; bold?: boolean; color?: string }) {
  const applied = ctrl?.applyStyleToSelected(partial)
  if (applied) syncTextStyleFromSelection()
}

/** 从当前选中的文字同步工具栏回显（选中的字号/粗体/颜色） */
function syncTextStyleFromSelection() {
  const st = ctrl?.getSelectedTextStyle()
  if (st) {
    textSize.value = st.size
    textBold.value = !!st.bold
    color.value = st.color
    selectedIsText.value = true
  } else {
    selectedIsText.value = false
  }
}

// 文字输入状态：定位到选中框内（居中浮层 → 改为画布框内）+ 落地
const showTextDialog = ref(false)
const editingText = ref('')
/** 输入浮层在 canvas-wrap 内的 CSS 坐标（由框的图片像素折算） */
const textPosCss = ref({ left: 0, top: 0, width: 200 })

function commitText() {
  if (!ctrl) return
  ctrl.commitText(editingText.value)
  showTextDialog.value = false
}
function cancelText() {
  showTextDialog.value = false
  ctrl?.cancelText()
}

/** 把图片像素坐标折算成 canvas-wrap 内 CSS 坐标（带 view scale/translate） */
function openTextInput(rect: { x: number; y: number; w: number; h: number }) {
  const cv = canvasRef.value
  const stage = stageRef.value
  if (!cv || !stage) return
  const cr = cv.getBoundingClientRect()
  const sr = stage.getBoundingClientRect()
  const sx = cr.width / cv.width
  const sy = cr.height / cv.height
  textPosCss.value = {
    left: cr.left - sr.left + rect.x * sx,
    top: cr.top - sr.top + rect.y * sy,
    width: Math.max(160, rect.w * sx)
  }
  // 正在重编辑文字时回填其内容
  const sel = ctrl?.selected
  editingText.value = sel && sel.type === 'text' ? sel.text : ''
  showTextDialog.value = true
  setTimeout(() => textInputRef.value?.focus(), 10)
}

function localPoint(e: PointerEvent): { x: number; y: number } {
  const cv = canvasRef.value!
  const r = cv.getBoundingClientRect()
  return {
    x: ((e.clientX - r.left) * cv.width) / r.width,
    y: ((e.clientY - r.top) * cv.height) / r.height
  }
}

// ── 平移 / 绘制模式切换 ──
// ── 图片区手势：点击=绘制（两点式），拖动=移动整个窗口 ──
const winId = new URLSearchParams(window.location.search).get('win') || ''
let dragging = false
let dragMoved = false
let dragStartX = 0
let dragStartY = 0
let lastX = 0
let lastY = 0

/**
 * 拖动"窗口"采用屏幕绝对坐标定位，彻底规避回环震动：
 *  `screenX - clientX` 恒等于窗口左上角屏幕坐标（frame:false 窗口），
 * 它由指针绝对位置算出，**不含任何窗口当前位置**，窗口被 setPosition 移动后
 * 不会反馋进下一次目标计算（clientX 增量方案会：窗口一动 clientX 就反向变化 → 窗口往返震）。
 * flushMove 只在目标坐标变化时才 setPosition（静止零 IPC、零重绘）。
 */
let moveTargetX = 0
let moveTargetY = 0
let rafPending = false
/** 拖动开始时指针相对窗口的位置（固定基准）。移窗用 startClient 而非实时 e.clientX：
 *  实时 clientX 随窗口移动变化，与 screenX 同步相减后得到"窗口当前位置"常数 → setPosition(原位) 永远移不动（拖不动）。
 *  用固定 startClient 则目标随 screenX 单调变化 → 窗口跟随移动。 */
let winStartClientX = 0
let winStartClientY = 0
/** 当前拖动手势类型：无 / 移窗 / 拖动选中标注 / 拖缩放手柄改大小 */
let dragType: 'none' | 'window' | 'annotation' | 'resize' = 'none'

/** 经 sendToParent 送主窗口移动编辑器窗口到绝对屏幕坐标（子窗口无法直接操作主窗口建的窗口） */
function moveEditorWindow(x: number, y: number) {
  const anyZtools = window.ztools as unknown as {
    sendToParent?: (channel: string, ...args: unknown[]) => void
  }
  if (winId && typeof anyZtools.sendToParent === 'function') {
    anyZtools.sendToParent('screenshot-annotate:editor-move', { winId, x: Math.round(x), y: Math.round(y) })
  }
}

/** 移窗：把最新绝对目标发给窗口落位（pointermove 只在指针真正移动时触发，被调度即已动过，直接发） */
function flushMove() {
  rafPending = false
  // 不做 `target===lastSent` 去重：在坐标恒等于初始值时会永远拦截、把窗口钉死原地（"完全拖不动"）。
  // rAF 节流本身已保证静止（无 pointermove）不产生 IPC。
  moveEditorWindow(moveTargetX, moveTargetY)
}
function onDown(e: PointerEvent) {
  // 文字输入框打开时，点击画布任意处（输入框外）→ 直接保存
  if (showTextDialog.value && !(e.target as HTMLElement).closest('.text-dialog')) {
    commitText()
    return
  }
  // 捕获指针：即使移出画布也持续收到 pointermove/pointerup，避免拖窗时松开在窗外导致 mouseup 丢失
  try {
    canvasRef.value?.setPointerCapture(e.pointerId)
  } catch {
    /* 捕获失败不影响后续（onMove 另有 buttons 兜底） */
  }
  dragging = true
  dragMoved = false
  dragStartX = e.clientX
  dragStartY = e.clientY
  lastX = e.clientX
  lastY = e.clientY
  // 记录移动窗口专用的固定基准（避免拖窗分支反复用实时 e.clientX 导致目标恒为原位）
  winStartClientX = e.clientX
  winStartClientY = e.clientY
  // 初始化绝对定位基准：当前窗口左上角屏幕坐标 = screenX - clientX
  moveTargetX = e.screenX - winStartClientX
  moveTargetY = e.screenY - winStartClientY
  // 微信截图式：不切工具也能直接跟手拖/缩放已存在的标注。指针按下先全局命中已有标注：
  //   - 命中 → 选中；若落在其缩放手柄上 → `resize`（改大小），否则跟手移动（文字后续可单击编辑）
  //   - 未命中 → 按当前工具：select 拖窗口，绘制/文字工具正常作画
  // 用 selectAt（命中即选中）而非 beginDragSelected（要求"已选中"）：首击点到未选中标注时
  // beginDragSelected 返回 false 会误拖整窗 → 选不中原 bug。selectAt 命中首击即选中。
  const p = localPoint(e)
  if (ctrl?.selectAt(p.x, p.y)) {
    if (ctrl?.hitHandleAt(p.x, p.y) && ctrl.beginResize(p.x, p.y)) {
      dragType = 'resize'
    } else {
      dragType = 'annotation'
    }
  } else if (currentTool.value === 'select') {
    dragType = 'window'
  } else {
    dragType = 'none'
    ctrl?.pointerDown(p.x, p.y)
  }
}
/** 强制结束本次拖拽：左键已松开（mouseup 丢失兜底），复位拖动状态、停止窗口/标注移动 */
function forceEndDrag(pointerId?: number) {
  if (dragType === 'annotation' && dragMoved) ctrl?.endDragSelected()
  if (dragType === 'resize' && dragMoved) ctrl?.endResize()
  dragType = 'none'
  dragging = false
  dragMoved = false
  if (pointerId !== undefined) {
    try {
      canvasRef.value?.releasePointerCapture(pointerId)
    } catch {
      /* 忽略 */
    }
  }
}

function onMove(e: PointerEvent) {
  const cv = canvasRef.value
  if (!dragging) {
    // 未拖动：hover 在选中标注的缩放手柄上 → 显示缩放光标（line/arrow 端点用移动光标）
    if (cv) {
      const p = localPoint(e)
      const onHandle = !!(ctrl?.selected && ctrl?.hitHandleAt(p.x, p.y))
      const selType = ctrl?.selected?.type
      cv.style.cursor = onHandle && selType !== 'line' && selType !== 'arrow' ? 'nwse-resize' : 'crosshair'
    }
    return
  }
  // 兜底：左键实际已松开（e.buttons 左键位为 0）但 pointerup 丢失 → 强制复位，防拖窗残留闪烁
  if (e.buttons !== undefined && (e.buttons & 1) === 0) {
    forceEndDrag(e.pointerId)
    return
  }
  // 位移阈值界定是否算拖动（拖窗/拖标注区分单击）
  if (dragType !== 'none' && !dragMoved &&
      Math.abs(e.clientX - dragStartX) + Math.abs(e.clientY - dragStartY) > 4) {
    dragMoved = true
  }
  if (dragType === 'annotation') {
    // 拖动选中标注：屏px 转为画布像素增量（除以缩放），纯本地移动零 IPC
    if (!dragMoved) return
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    const s = Math.max(view.scale, 0.01)
    ctrl?.moveSelectedBy(dx / s, dy / s)
    return
  }
  if (dragType === 'resize') {
    // 拖缩放手柄：指针画布坐标直接交给 controller 按锚点缩放
    if (!dragMoved) return
    const p = localPoint(e)
    ctrl?.resizeTo(p.x, p.y)
    return
  }
  if (dragType === 'window') {
    // 拖窗口：目标 = screenX - 固定基准 winStartClient（非实时 e.clientX），
    // 使目标随指针屏幕位置单调变化（跟随移动），避免实时 clientX 抵消 → 目标恒原位 → 拖不动
    moveTargetX = e.screenX - winStartClientX
    moveTargetY = e.screenY - winStartClientY
    if (!rafPending) {
      rafPending = true
      requestAnimationFrame(flushMove)
    }
    return
  }
  // 绘制工具：实时绘制
  const p = localPoint(e)
  ctrl?.pointerMove(p.x, p.y)
}
function onUp(e: PointerEvent) {
  dragging = false
  if (dragType === 'annotation') {
    if (dragMoved) {
      ctrl?.endDragSelected()
    } else {
      // 单击未拖：文字 → 再次编辑内容；其它标注保持选中
      const sel = ctrl?.selected
      if (sel && sel.type === 'text') {
        ctrl?.startEditSelectedText()
      }
    }
    dragType = 'none'
    canUndo.value = !!ctrl?.canUndo
    canRedo.value = !!ctrl?.canRedo
    return
  }
  if (dragType === 'window') {
    dragType = 'none'
    // 把最后一次未提交的目标发出，避免拖尾残留
    if (rafPending) {
      rafPending = false
      flushMove()
    }
    return
  }
  if (dragType === 'resize') {
    // 缩放结束（拖前状态已在首次 move 入栈；纯单击未拖则无副作用）
    ctrl?.endResize()
    dragType = 'none'
    canUndo.value = !!ctrl?.canUndo
    canRedo.value = !!ctrl?.canRedo
    return
  }
  dragType = 'none'
  ctrl?.pointerUp()
  canUndo.value = !!ctrl?.canUndo
  canRedo.value = !!ctrl?.canRedo
}
function onWheel(e: WheelEvent) {
  e.preventDefault()
  zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15)
}

function exportDataURL(): string {
  return ctrl!.canvasElement.toDataURL('image/png')
}

/** 全局按键：Esc 关闭编辑窗口 */
function onGlobalKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    props.onClose()
    return
  }
  if (e.ctrlKey || e.metaKey) {
    const k = e.key.toLowerCase()
    if (k === 'z') {
      e.preventDefault()
      undo()
      return
    }
    if (k === 'y') {
      e.preventDefault()
      redo()
      return
    }
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && currentTool.value === 'select') {
    ctrl?.deleteSelected()
    canUndo.value = !!ctrl?.canUndo
    canRedo.value = !!ctrl?.canRedo
  }
}

/** 应用固定默认颜色/线宽（若已实例化 ctrl 立即同步） */
function applySettings() {
  if (!ctrl) return
  color.value = DEFAULT_COLOR
  lineWidth.value = DEFAULT_LINE_WIDTH
  ctrl.setColor(DEFAULT_COLOR)
  ctrl.setLineWidth(DEFAULT_LINE_WIDTH)
}

onMounted(() => {
  const img = document.createElement('img')
  img.onload = () => {
    source = img
    const cv = canvasRef.value!
    ctrl = new EditorController(cv, img, props.width, props.height)
    ctrl.onTextRequest = openTextInput
    ctrl.onSelectionChange = syncTextStyleFromSelection
    applySettings()
    ctrl.render()
    recomputeFit()
  }
  img.src = props.dataUrl
  recomputeFit()
  // 窗口尺寸变化时重算铺满基础缩放；首次给一次延迟确保布局就绪
  const stage = stageRef.value
  if (stage) {
    ro = new ResizeObserver(() => recomputeFit())
    ro.observe(stage)
  }
  window.addEventListener('keydown', onGlobalKey)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKey)
  ro?.disconnect()
  ctrl = null
  source = null
})

defineExpose({ exportDataURL })
</script>

<template>
  <div class="editor-canvas-stage">
    <div ref="stageRef" class="canvas-wrap">
      <div
        v-if="showTextDialog"
        class="text-dialog"
        :style="{ left: textPosCss.left + 'px', top: textPosCss.top + 'px', width: textPosCss.width + 'px' }"
      >
        <textarea
          ref="textInputRef"
          v-model="editingText"
          class="text-input"
          rows="1"
          placeholder="输入文字，回车确认"
          :style="{ color, fontSize: `${Math.round(textSize / Math.max(view.scale, 0.2))}px`, fontWeight: textBold ? 'bold' : 'normal' }"
          @keydown.enter.prevent="commitText"
          @keydown.esc="cancelText"
          @blur="commitText"
        />
      </div>
      <canvas
        ref="canvasRef"
        class="editor-canvas"
        :style="{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})` }"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @wheel="onWheel"
      />
    </div>

    <div class="wx-toolbar">
      <!-- 顶部第 1 组：工具图标 -->
      <div class="tb-group">
        <button
          v-for="t in tools"
          :key="t.kind"
          class="tb-icon"
          :class="{ on: currentTool === t.kind }"
          :title="t.label"
          @click="pickTool(t.kind)"
        >
          <svg viewBox="0 0 24 24" class="tb-svg">
            <path v-for="(d, i) in iconPath[t.kind]" :key="i" :d="d" />
          </svg>
        </button>
      </div>

      <div class="tb-line" />

      <!-- 撤销/重做 -->
      <div class="tb-group">
        <button class="tb-icon" :disabled="!canUndo" title="撤销 (Ctrl+Z)" @click="undo">
          <svg viewBox="0 0 24 24" class="tb-svg"><path d="M8 5 L3 10 L8 15" /><path d="M4 10 H16 A4 4 0 0 1 16 18 H12" /></svg>
        </button>
        <button class="tb-icon" :disabled="!canRedo" title="重做 (Ctrl+Y)" @click="redo">
          <svg viewBox="0 0 24 24" class="tb-svg"><path d="M16 5 L21 10 L16 15" /><path d="M20 10 H8 A4 4 0 0 0 8 18 H12" /></svg>
        </button>
      </div>

      <div class="tb-line" />

      <!-- 颜色色板 -->
      <div class="tb-group colors">
        <button
          v-for="c in colors"
          :key="c"
          class="swatch"
          :class="{ on: color === c }"
          :style="{ background: c }"
          :title="c"
          @click="pickColor(c)"
        />
      </div>

      <div class="tb-group">
        <button
          v-for="w in lineWidths"
          :key="w"
          class="tb-w"
          :class="{ on: lineWidth === w }"
          :title="w + 'px'"
          @click="pickWidth(w)"
        >
          {{ w }}
        </button>
        <button class="tb-icon" :class="{ on: fill }" title="填充" @click="toggleFill">
          <svg viewBox="0 0 24 24" class="tb-svg"><path d="M4 6 H20 V12 H4 Z M4 14 H20 V18 H4 Z" /></svg>
        </button>
      </div>

      <!-- 马赛克扩展：形状 + 尺寸 -->
      <div v-if="currentTool === 'mosaic'" class="tb-group mosaic-o">
        <button class="tb-icon" :class="{ on: mosaicShape === 'rect' }" title="方格" @click="pickMosaicShape('rect')">
          <svg viewBox="0 0 24 24" class="tb-svg"><path d="M4 4 H20 V20 H4 Z M4 12 H20 M12 4 V20" /></svg>
        </button>
        <button class="tb-icon" :class="{ on: mosaicShape === 'round' }" title="球状" @click="pickMosaicShape('round')">
          <svg viewBox="0 0 24 24" class="tb-svg"><path d="M12 4 A8 8 0 0 1 12 20 A8 8 0 0 1 12 4 Z M7 7 H17 M7 12 H17 M7 17 H17 M12 7 V17" /></svg>
        </button>
        <button
          v-for="c in mosaicSizes"
          :key="c"
          class="tb-w"
          :class="{ on: mosaicCell === c }"
          :title="'格 ' + c"
          @click="pickMosaicCell(c)"
        >
          {{ c }}
        </button>
      </div>

      <!-- 文字扩展：字号 + 粗体（文字工具或选中文字时展开） -->
      <div v-if="currentTool === 'text' || selectedIsText" class="tb-group">
        <button class="tb-icon" :class="{ on: textBold }" title="粗体" @click="pickTextBold">
          <svg viewBox="0 0 24 24" class="tb-svg"><path d="M7 4 H14 A3.5 3.5 0 0 1 14 11 H7 Z M7 11 H15 A3 3 0 0 1 15 18 H7 Z" /></svg>
        </button>
        <button
          v-for="s in textSizes"
          :key="s"
          class="tb-w"
          :class="{ on: textSize === s }"
          :title="'字号 ' + s"
          @click="pickTextSize(s)"
        >
          {{ s }}
        </button>
      </div>

      <div class="tb-spacer" />

      <!-- 底部操作：取消/复制/保存/钉图 -->
      <div class="tb-group">
        <button class="tb-icon danger" title="取消 (Esc)" @click="props.onClose">
          <svg viewBox="0 0 24 24" class="tb-svg"><path d="M6 6 L18 18 M18 6 L6 18" /></svg>
        </button>
        <button class="tb-icon primary" title="复制 (Ctrl+C)" @click="props.onCopy(exportDataURL())">
          <svg viewBox="0 0 24 24" class="tb-svg"><rect x="8" y="8" width="12" height="12" /><path d="M4 16 V4 H16" /></svg>
        </button>
        <button class="tb-icon primary" title="保存 (Ctrl+S)" @click="props.onSave(exportDataURL())">
          <svg viewBox="0 0 24 24" class="tb-svg"><path d="M12 4 V16 M6 11 L12 17 L18 11" /><path d="M4 19 V20 H20 V19" /></svg>
        </button>
        <button v-if="props.onPin" class="tb-icon primary" title="钉图" @click="props.onPin!(exportDataURL())">
          <svg viewBox="0 0 24 24" class="tb-svg"><path d="M8 21 L9 16 L5 12 V10 H19 V12 L15 16 L16 21 Z" /></svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── 整窗深色遮罩（微信截图式）── */
.editor-canvas-stage {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1c1c20;
  overflow: hidden;
  user-select: none;
}
.canvas-wrap {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
/* 图片区域：圆角 + 微描边 + 阴影，悬浮于遮罩之上 */
.editor-canvas {
  display: block;
  background: #000;
  cursor: crosshair;
  transform-origin: center center;
  touch-action: none;
}
/* 文字输入浮层：定位到框内（left/top 由 openTextInput 折算） */
.text-dialog {
  position: absolute;
  z-index: 30;
  transform-origin: 0 0;
  -webkit-app-region: no-drag;
}
.text-input {
  width: 100%;
  min-height: 40px;
  box-sizing: border-box;
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.72);
  color: #fff;
  border: 1.5px dashed #4c8dff;
  border-radius: 6px;
  outline: none;
  font-weight: bold;
  font-family: sans-serif;
  resize: none;
  white-space: pre-wrap;
  overflow: hidden;
}
.text-input::placeholder {
  color: rgba(255, 255, 255, 0.5);
}

/* ── 右侧竖向浮动工具条（微信截图式图标栏）── */
.wx-toolbar {
  /* 悬浮覆盖图片底部（窗口贴合选区、图片占满时，按钮即"底层"） */
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 18px 10px 10px;
  background: linear-gradient(transparent, rgba(18, 20, 26, 0.86) 38%);
  -webkit-app-region: no-drag;
  user-select: none;
}
.tb-group {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 2px;
}
.tb-line {
  width: 1px;
  height: 24px;
  background: rgba(255, 255, 255, 0.16);
  margin: 0 4px;
}
.tb-spacer {
  width: 6px;
}
.tb-icon {
  width: 36px;
  height: 36px;
  margin: 1px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #c8ccd4;
  border-radius: 9px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  -webkit-app-region: no-drag;
}
.tb-icon:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
.tb-icon.on {
  background: #3a76f0;
  color: #fff;
}
.tb-icon.danger:hover {
  background: #e5484d;
  color: #fff;
}
.tb-icon.primary {
  color: #fff;
}
.tb-icon.primary:hover {
  background: rgba(255, 255, 255, 0.14);
}
.tb-icon:disabled {
  opacity: 0.3;
  cursor: default;
  background: transparent;
}
.tb-svg {
  width: 21px;
  height: 21px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
/* 色板：横向单行小圆点 */
.tb-group.colors {
  flex-direction: row;
  flex-wrap: nowrap;
  gap: 4px;
  padding: 0 4px;
}
.swatch {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.25);
  cursor: pointer;
  padding: 0;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.2);
  -webkit-app-region: no-drag;
}
.swatch.on {
  outline: 2px solid #3a76f0;
  outline-offset: 2px;
}
/* 线宽小号 */
.tb-w {
  min-width: 30px;
  height: 30px;
  padding: 0 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #c8ccd4;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  -webkit-app-region: no-drag;
}
.tb-w:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
.tb-w.on {
  background: #3a76f0;
  color: #fff;
}
</style>