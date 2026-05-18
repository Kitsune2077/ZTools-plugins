<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'

type TaskStatus = 'waiting' | 'hashing' | 'done' | 'error'
type HashCase = 'lowercase' | 'uppercase'

type BaseHashTask = {
  id: string
  kind: 'file' | 'text'
  name: string
  size: number
  status: TaskStatus
  progress: number
  error: string
  algorithms: HashAlgorithm[]
  hashes: HashResult | null
  displayCases: Partial<Record<HashAlgorithm, HashCase>>
}

type FileHashTask = BaseHashTask &
  FileInfo & {
    kind: 'file'
  }

type TextHashTask = BaseHashTask & {
  kind: 'text'
  path: ''
  text: string
}

type HashTask = FileHashTask | TextHashTask

type PluginFileEnterAction = {
  type: string
  payload?: Array<{ path?: string }>
}

type Settings = {
  largeFileWarningEnabled: boolean
  largeFileWarningThresholdGB: number
  extraAlgorithms: ExtraHashAlgorithm[]
  defaultCase: HashCase
}

const SETTINGS_KEY = 'my-hash-tool.settings'
const DEFAULT_SETTINGS: Settings = {
  largeFileWarningEnabled: true,
  largeFileWarningThresholdGB: 2,
  extraAlgorithms: [],
  defaultCase: 'lowercase'
}
const BYTES_PER_GB = 1024 * 1024 * 1024
const CORE_HASH_ALGORITHMS: CoreHashAlgorithm[] = ['md5', 'sha1', 'sha256']
const EXTRA_HASH_ALGORITHMS: ExtraHashAlgorithm[] = ['crc32', 'sha384', 'sha512']
const HASH_ALGORITHM_LABELS: Record<HashAlgorithm, string> = {
  md5: 'MD5',
  sha1: 'SHA1',
  sha256: 'SHA256',
  crc32: 'CRC32',
  sha384: 'SHA384',
  sha512: 'SHA512'
}

const route = ref<'main' | 'settings'>('main')
const tasks = ref<HashTask[]>([])
const textInput = ref('')
const inputRepresentsFiles = ref(false)
const isDragging = ref(false)
const isHashing = ref(false)
const cancelRequested = ref(false)
const isUnmounted = ref(false)
const copiedKey = ref('')
const warningFiles = ref<FileInfo[]>([])
const warningVisible = ref(false)
const disableFutureWarnings = ref(false)
const settings = reactive<Settings>({ ...DEFAULT_SETTINGS })
const completionToast = ref('')
const completionToastTone = ref<'neutral' | 'error'>('neutral')
let completionToastTimer: ReturnType<typeof setTimeout> | null = null

const thresholdInput = computed({
  get: () => String(settings.largeFileWarningThresholdGB),
  set: (value: string) => {
    const nextValue = Number(value)
    // 验证阈值范围：1-1024 GB
    if (Number.isFinite(nextValue) && nextValue >= 1 && nextValue <= 1024) {
      settings.largeFileWarningThresholdGB = nextValue
    }
  }
})

const taskSummary = computed(() => {
  const summary = {
    total: tasks.value.length,
    done: 0,
    hashing: 0,
    waiting: 0,
    error: 0
  }

  for (const task of tasks.value) {
    summary[task.status] += 1
  }

  return summary
})

const batchProgress = computed(() => {
  if (!tasks.value.length) return 0

  const totalProgress = tasks.value.reduce((sum, task) => sum + task.progress, 0)
  return Math.round(totalProgress / tasks.value.length)
})

const enabledAlgorithms = computed<HashAlgorithm[]>(() => [
  ...CORE_HASH_ALGORITHMS,
  ...settings.extraAlgorithms
])

const warningSummary = computed(() => {
  const totalSize = warningFiles.value.reduce((sum, file) => sum + file.size, 0)

  return {
    count: warningFiles.value.length,
    totalSize
  }
})

function loadSettings() {
  try {
    const saved = window.ztools?.dbStorage?.getItem<Partial<Settings>>(SETTINGS_KEY)
    Object.assign(settings, normalizeSettings(saved))
    return
  } catch {
    // dbStorage 不可用时降级到 localStorage
  }

  try {
    const saved = window.localStorage.getItem(SETTINGS_KEY)
    Object.assign(settings, normalizeSettings(saved ? JSON.parse(saved) : null))
  } catch {
    // localStorage 内容损坏时显式回退到默认值，避免静默使用陈旧 settings 状态
    Object.assign(settings, { ...DEFAULT_SETTINGS })
    try {
      window.localStorage.removeItem(SETTINGS_KEY)
    } catch {
      // ignore
    }
  }
}

function saveSettings() {
  const nextSettings = normalizeSettings(settings)
  Object.assign(settings, nextSettings)

  try {
    window.ztools?.dbStorage?.setItem(SETTINGS_KEY, nextSettings)
  } catch {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(nextSettings))
  }
}

function normalizeSettings(value?: Partial<Settings> | null): Settings {
  const threshold = Number(value?.largeFileWarningThresholdGB)
  // 显式区分 "字段缺失" 与 "用户主动清空数组"：仅缺失时才回退默认，避免未来调整默认值时静默覆盖用户配置
  const extraAlgorithms = Array.isArray(value?.extraAlgorithms)
    ? value.extraAlgorithms.filter((algorithm): algorithm is ExtraHashAlgorithm =>
        EXTRA_HASH_ALGORITHMS.includes(algorithm as ExtraHashAlgorithm)
      )
    : value?.extraAlgorithms === undefined
      ? DEFAULT_SETTINGS.extraAlgorithms
      : []

  return {
    largeFileWarningEnabled:
      typeof value?.largeFileWarningEnabled === 'boolean'
        ? value.largeFileWarningEnabled
        : DEFAULT_SETTINGS.largeFileWarningEnabled,
    largeFileWarningThresholdGB:
      // 保留两位小数避免持久化浮点漂移（如 0.1 + 0.2 类问题）
      Number.isFinite(threshold) && threshold >= 1 && threshold <= 1024
        ? Number(threshold.toFixed(2))
        : DEFAULT_SETTINGS.largeFileWarningThresholdGB,
    extraAlgorithms: Array.from(new Set(extraAlgorithms)),
    defaultCase:
      value?.defaultCase === 'lowercase' || value?.defaultCase === 'uppercase'
        ? value.defaultCase
        : DEFAULT_SETTINGS.defaultCase
  }
}

function updateThreshold() {
  saveSettings()
}

function openSettings() {
  route.value = 'settings'
}

function closeSettings() {
  saveSettings()
  route.value = 'main'
}

function selectFiles() {
  if (isHashing.value) return
  withServices(
    (services) => {
      const files = services.selectFiles()
      handleFiles(files)
    },
    '选择文件失败'
  )
}

function hashTextInput() {
  if (isHashing.value) return
  if (inputRepresentsFiles.value) return

  const text = textInput.value
  if (!text.length) {
    notifyError('请输入需要计算 Hash 的字符串，或拖入文件', '输入为空')
    return
  }

  startTextHashing(text)
}

function handleDragEnter(event: DragEvent) {
  if (route.value !== 'main' || isHashing.value) return
  event.preventDefault()
  isDragging.value = true
}

function handleDragOver(event: DragEvent) {
  if (route.value !== 'main' || isHashing.value) return
  event.preventDefault()
  if (!isDragging.value) isDragging.value = true
}

function handleDragLeave(event: DragEvent) {
  const related = event.relatedTarget
  const current = event.currentTarget as HTMLElement
  // relatedTarget 可能是 Element 或 null，使用 instanceof 检查
  if (!related || !(related instanceof Node) || !current.contains(related)) {
    isDragging.value = false
  }
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  isDragging.value = false

  if (route.value !== 'main' || isHashing.value) return

  const files = event.dataTransfer?.files
  if (!files?.length) return

  withServices(
    (services) => {
      handleFiles(services.getDroppedFileInfos(files))
    },
    '读取文件信息失败'
  )
}

function clearTasks() {
  if (isHashing.value) return
  tasks.value = []
  textInput.value = ''
  inputRepresentsFiles.value = false
  copiedKey.value = ''
}

function handleFiles(files: FileInfo[]) {
  if (!files.length) return

  const normalizedFiles = dedupeFiles(files)
  textInput.value = normalizedFiles.map((file) => file.path).join('\n')
  inputRepresentsFiles.value = true

  if (shouldWarnLargeFiles(normalizedFiles)) {
    warningFiles.value = normalizedFiles
    warningVisible.value = true
    disableFutureWarnings.value = false
    return
  }

  void startHashing(normalizedFiles)
}

function dedupeFiles(files: FileInfo[]) {
  const seen = new Set<string>()
  return files.filter((file) => {
    if (seen.has(file.path)) return false
    seen.add(file.path)
    return true
  })
}

function shouldWarnLargeFiles(files: FileInfo[]) {
  if (!settings.largeFileWarningEnabled) return false

  const thresholdBytes = settings.largeFileWarningThresholdGB * BYTES_PER_GB
  const totalSize = files.reduce((sum, file) => sum + file.size, 0)
  return totalSize > thresholdBytes || files.some((file) => file.size > thresholdBytes)
}

function continueAfterWarning() {
  if (disableFutureWarnings.value) {
    settings.largeFileWarningEnabled = false
    saveSettings()
  }

  warningVisible.value = false
  void startHashing(warningFiles.value)
}

function cancelWarning() {
  warningVisible.value = false
  warningFiles.value = []
  disableFutureWarnings.value = false
}

async function startHashing(files: FileInfo[]) {
  const algorithms = enabledAlgorithms.value
  tasks.value = files.map((file) => createTask(file, algorithms))
  isHashing.value = true
  cancelRequested.value = false

  for (const task of tasks.value) {
    if (cancelRequested.value) {
      // 用户请求中断后，剩余任务标记为已取消，跳过实际计算
      task.status = 'error'
      task.error = '已取消'
      task.progress = 0
      continue
    }

    task.status = 'hashing'
    task.error = ''
    task.progress = 0

    try {
      task.hashes = await window.services.hashFile(task.path, task.algorithms, (progress) => {
        task.progress = Math.round(progress.progress)
      })
      task.progress = 100
      task.status = 'done'
    } catch (error) {
      task.status = 'error'
      task.error = getErrorMessage(error)
      task.progress = 0
    }
  }

  isHashing.value = false
  cancelRequested.value = false
  notifyBatchFinished(tasks.value)
}

function cancelHashing() {
  if (!isHashing.value) return
  cancelRequested.value = true
}

function startTextHashing(text: string) {
  const task = createTextTask(text, enabledAlgorithms.value)
  tasks.value = [task]
  isHashing.value = true
  task.status = 'hashing'
  task.progress = 35

  // 使用 setTimeout 让 UI 有机会更新进度条状态，避免同步阻塞导致界面卡顿
  // 文本哈希计算通常很快，80ms 延迟给用户视觉反馈
  window.setTimeout(() => {
    try {
      task.hashes = window.services.hashText(text, task.algorithms)
      task.progress = 100
      task.status = 'done'
    } catch (error) {
      task.status = 'error'
      task.error = getErrorMessage(error)
      task.progress = 0
    } finally {
      isHashing.value = false
    }
  }, 80)
}

function buildInitialDisplayCases(algorithms: HashAlgorithm[]): Partial<Record<HashAlgorithm, HashCase>> {
  const initialCase = settings.defaultCase
  const result: Partial<Record<HashAlgorithm, HashCase>> = {}
  for (const algorithm of algorithms) {
    result[algorithm] = initialCase
  }
  return result
}

function createTask(file: FileInfo, algorithms: HashAlgorithm[]): FileHashTask {
  return {
    ...file,
    id: `${file.path}-${file.size}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    kind: 'file',
    status: 'waiting',
    progress: 0,
    error: '',
    algorithms: [...algorithms],
    hashes: null,
    displayCases: buildInitialDisplayCases(algorithms)
  }
}

function createTextTask(text: string, algorithms: HashAlgorithm[]): TextHashTask {
  return {
    id: `text-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    kind: 'text',
    path: '',
    text,
    name: '字符串输入',
    size: new TextEncoder().encode(text).length,
    status: 'waiting',
    progress: 0,
    error: '',
    algorithms: [...algorithms],
    hashes: null,
    displayCases: buildInitialDisplayCases(algorithms)
  }
}

function getStatusText(task: HashTask) {
  if (task.status === 'waiting') return '等待计算'
  if (task.status === 'hashing') return '正在计算'
  if (task.status === 'done') return '计算完成'
  return task.kind === 'file' ? `读取失败：${task.error}` : `计算失败：${task.error}`
}

function applyCase(value: string, displayCase: HashCase) {
  // 显式调用避免依赖 "底层 digest 总返回小写" 的隐式契约
  return displayCase === 'uppercase' ? value.toUpperCase() : value.toLowerCase()
}

function getDisplayedHash(task: HashTask, algorithm: HashAlgorithm) {
  const raw = task.hashes?.[algorithm]
  if (!raw) return ''
  const displayCase = task.displayCases[algorithm] ?? 'lowercase'
  return applyCase(raw, displayCase)
}

function getHashValue(task: HashTask, algorithm: HashAlgorithm) {
  if (task.status === 'done' && task.hashes) return getDisplayedHash(task, algorithm) || '未计算'
  if (task.status === 'error') return '未计算'
  if (task.status === 'waiting') return '等待计算'
  return '正在计算...'
}

function getRowCase(task: HashTask, algorithm: HashAlgorithm): HashCase {
  return task.displayCases[algorithm] ?? 'lowercase'
}

function isRowCaseToggleEnabled(task: HashTask) {
  return task.status === 'done'
}

function getRowCaseToggleLabel(task: HashTask, algorithm: HashAlgorithm) {
  const algorithmLabel = HASH_ALGORITHM_LABELS[algorithm]
  const targetLabel = getRowCase(task, algorithm) === 'uppercase' ? '小写' : '大写'
  return `切换 ${algorithmLabel} 为${targetLabel}`
}

function toggleRowCase(task: HashTask, algorithm: HashAlgorithm) {
  if (!isRowCaseToggleEnabled(task)) return
  task.displayCases[algorithm] = getRowCase(task, algorithm) === 'uppercase' ? 'lowercase' : 'uppercase'
}

function applyAllCase(target: HashCase) {
  for (const task of tasks.value) {
    if (task.status !== 'done') continue
    for (const algorithm of task.algorithms) {
      task.displayCases[algorithm] = target
    }
  }
}

async function copyHash(task: HashTask, algorithm: HashAlgorithm) {
  if (!task.hashes) return

  const value = getDisplayedHash(task, algorithm)
  if (!value) return

  if (!(await copyText(value))) return

  copiedKey.value = `${task.id}-${algorithm}`
  window.setTimeout(() => {
    if (copiedKey.value === `${task.id}-${algorithm}`) {
      copiedKey.value = ''
    }
  }, 1500)
}

async function copyTaskHashes(task: HashTask) {
  if (!task.hashes) return

  if (!(await copyText(formatTaskHashes(task)))) return

  copiedKey.value = `${task.id}-all`
  window.setTimeout(() => {
    if (copiedKey.value === `${task.id}-all`) {
      copiedKey.value = ''
    }
  }, 1500)
}

async function copyAllHashes() {
  const doneTasks = tasks.value.filter((task) => task.status === 'done' && task.hashes)
  if (!doneTasks.length) return

  if (!(await copyText(doneTasks.map((task) => formatTaskHashes(task)).join('\n\n')))) return

  copiedKey.value = 'all-results'
  window.setTimeout(() => {
    if (copiedKey.value === 'all-results') {
      copiedKey.value = ''
    }
  }, 1500)
}

async function copyText(value: string) {
  try {
    if (!window.ztools?.copyText?.(value)) {
      await navigator.clipboard.writeText(value)
    }
  } catch (error) {
    notifyError(error, '复制失败')
    return false
  }

  return true
}

function formatTaskHashes(task: HashTask) {
  if (!task.hashes) return ''

  const title = task.kind === 'file' ? task.path : '字符串输入'

  return [
    title,
    ...task.algorithms.map((algorithm) => `${HASH_ALGORITHM_LABELS[algorithm]}: ${getDisplayedHash(task, algorithm) || '未计算'}`)
  ].join('\n')
}

function toggleExtraAlgorithm(algorithm: ExtraHashAlgorithm, enabled: boolean) {
  const nextAlgorithms = new Set(settings.extraAlgorithms)
  if (enabled) {
    nextAlgorithms.add(algorithm)
  } else {
    nextAlgorithms.delete(algorithm)
  }

  settings.extraAlgorithms = EXTRA_HASH_ALGORITHMS.filter((item) => nextAlgorithms.has(item))
  saveSettings()
}

function isExtraAlgorithmEnabled(algorithm: ExtraHashAlgorithm) {
  return settings.extraAlgorithms.includes(algorithm)
}

function setDefaultCase(value: HashCase) {
  if (settings.defaultCase === value) return
  settings.defaultCase = value
  saveSettings()
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** unitIndex

  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

function getTaskMeta(task: HashTask) {
  if (task.kind === 'text') {
    return `${task.text.length} 个字符 / ${formatBytes(task.size)}`
  }

  return task.path
}

function getTaskSize(task: HashTask) {
  if (task.kind === 'text') return 'UTF-8'
  return formatBytes(task.size)
}

function handleTextInput() {
  inputRepresentsFiles.value = false
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return '未知错误'
}

function notifyError(error: unknown, title: string) {
  const message = `${title}：${getErrorMessage(error)}`
  showCompletionToast(message, 'error')
}

// 提取重复的 services 调用模式
function withServices<T>(fn: (services: Services) => T, errorTitle: string): T | undefined {
  if (!window.services) {
    notifyError('请在 ZTools 中操作，浏览器预览仅用于查看界面', '当前环境不可用')
    return
  }
  try {
    return fn(window.services)
  } catch (error) {
    notifyError(error, errorTitle)
  }
}

function notifyBatchFinished(finishedTasks: HashTask[]) {
  if (finishedTasks.length <= 1) return

  const failedCount = finishedTasks.filter((task) => task.status === 'error').length
  const doneCount = finishedTasks.length - failedCount
  const message = failedCount
    ? `Hash 计算完成：${doneCount} 个成功，${failedCount} 个失败`
    : `Hash 计算完成：${doneCount} 个文件已处理`

  showCompletionToast(message, 'neutral')
}

function showCompletionToast(message: string, tone: 'neutral' | 'error' = 'neutral') {
  completionToast.value = message
  completionToastTone.value = tone

  if (completionToastTimer !== null) {
    window.clearTimeout(completionToastTimer)
  }

  completionToastTimer = window.setTimeout(() => {
    completionToast.value = ''
    completionToastTimer = null
  }, 2600)
}

function handlePluginEnter(action: PluginFileEnterAction) {
  // 卸载守卫：ZTools 暂未提供 off* 反注册接口，组件卸载后用 isUnmounted 拦截回调
  if (isUnmounted.value) return

  route.value = 'main'

  if (action.type !== 'files' || !Array.isArray(action.payload)) return
  if (isHashing.value) {
    showCompletionToast('正在计算中，请稍后再添加文件', 'error')
    return
  }

  const paths = action.payload.map((item: { path?: string }) => item.path).filter((p): p is string => Boolean(p))
  if (!paths.length) return

  withServices(
    (services) => {
      handleFiles(services.getFileInfos(paths))
    },
    '读取文件信息失败'
  )
}

function handlePluginOut() {
  if (isUnmounted.value) return
  isDragging.value = false
}

onMounted(() => {
  loadSettings()

  window.ztools?.onPluginEnter?.(handlePluginEnter)
  window.ztools?.onPluginOut?.(handlePluginOut)
})

onUnmounted(() => {
  // 标记卸载，让仍可能被 ZTools 触发的 onPluginEnter/onPluginOut 回调直接 no-op
  isUnmounted.value = true
  // 取消进行中的批处理（避免回调继续操作已卸载组件的 reactive state）
  cancelRequested.value = true
  // 清理拖拽状态
  isDragging.value = false
  // 清理定时器
  if (completionToastTimer !== null) {
    window.clearTimeout(completionToastTimer)
    completionToastTimer = null
  }
  // 注意：ZTools 当前 API 未提供 onPluginEnter / onPluginOut 的反注册接口；
  // 如未来开放（如 offPluginEnter），可在此处调用以替代 isUnmounted 守卫。
})
</script>

<template>
  <main
    class="app-shell"
    :class="{ 'is-drop-target': isDragging && route === 'main' }"
    @dragenter="handleDragEnter"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <template v-if="route === 'main'">
      <header class="main-actions">
        <span class="algorithm-note">{{ enabledAlgorithms.map((algorithm) => HASH_ALGORITHM_LABELS[algorithm]).join(' / ') }}</span>
        <div class="main-action-buttons">
          <button
            v-if="isHashing"
            class="text-button"
            type="button"
            title="取消剩余批处理任务（已计算完成的结果不会被清除）"
            :disabled="cancelRequested"
            @click="cancelHashing"
          >
            {{ cancelRequested ? '正在取消…' : '取消' }}
          </button>
          <button
            v-if="tasks.length && !isHashing"
            class="text-button"
            type="button"
            title="清空当前任务"
            @click="clearTasks"
          >
            清空
          </button>
          <button
            v-if="tasks.some((task) => task.status === 'done')"
            class="text-button"
            type="button"
            title="将所有结果统一为小写"
            @click="applyAllCase('lowercase')"
          >
            全部小写
          </button>
          <button
            v-if="tasks.some((task) => task.status === 'done')"
            class="text-button"
            type="button"
            title="将所有结果统一为大写"
            @click="applyAllCase('uppercase')"
          >
            全部大写
          </button>
          <button
            v-if="!isHashing && tasks.some((task) => task.status === 'done')"
            class="secondary-button"
            type="button"
            title="复制全部已完成结果"
            @click="copyAllHashes"
          >
            {{ copiedKey === 'all-results' ? '已复制全部' : '复制全部结果' }}
          </button>
          <button class="icon-button" type="button" title="设置" @click="openSettings">设置</button>
        </div>
      </header>

      <section
        class="input-zone"
        :class="{ 'is-dragging': isDragging, 'is-busy': isHashing, 'is-file-mode': inputRepresentsFiles }"
      >
        <label class="input-label" for="hash-input">
          {{ isDragging ? '松开开始计算文件 Hash' : inputRepresentsFiles ? `已选择 ${tasks.length || textInput.split('\n').filter(Boolean).length} 个文件` : '输入字符串或拖入文件' }}
        </label>
        <textarea
          id="hash-input"
          v-model="textInput"
          :disabled="isHashing"
          :readonly="inputRepresentsFiles"
          spellcheck="false"
          placeholder="在这里输入或粘贴字符串；也可以把文件拖到这个输入框区域。"
          @input="handleTextInput"
          @keydown.meta.enter.prevent="hashTextInput"
          @keydown.ctrl.enter.prevent="hashTextInput"
        ></textarea>
        <div class="input-actions">
          <span class="shortcut-hint">⌘/Ctrl + Enter 计算字符串</span>
          <button
            class="secondary-button"
            type="button"
            :disabled="isHashing || inputRepresentsFiles"
            @click="hashTextInput"
          >
            计算字符串
          </button>
          <button class="primary-button" type="button" :disabled="isHashing" @click="selectFiles">
            选择文件
          </button>
        </div>
      </section>

      <section v-if="tasks.length > 1" class="batch-panel" aria-label="任务汇总">
        <div class="batch-panel__header">
          <span>{{ isHashing ? '批量计算中' : '批量计算完成' }}</span>
          <strong>{{ batchProgress }}%</strong>
        </div>
        <div class="batch-progress" aria-hidden="true">
          <span class="batch-progress__done" :style="{ width: `${batchProgress}%` }"></span>
        </div>
        <div class="batch-stats">
          <span>{{ taskSummary.total }} 项</span>
          <span>{{ taskSummary.done }} 完成</span>
          <span v-if="taskSummary.hashing">{{ taskSummary.hashing }} 计算中</span>
          <span v-if="taskSummary.waiting">{{ taskSummary.waiting }} 等待</span>
          <span v-if="taskSummary.error">{{ taskSummary.error }} 失败</span>
        </div>
      </section>

      <section v-if="!tasks.length" class="empty-state">
        <h2>计算结果会显示在这里</h2>
        <p>字符串会直接计算；文件会分块读取，已启用的算法会在同一遍文件流中完成。</p>
      </section>

      <section v-else class="task-list" aria-label="Hash 计算结果">
        <article
          v-for="task in tasks"
          :key="task.id"
          class="task-card"
          :class="`is-${task.status}`"
        >
          <div class="task-card__header">
            <div class="file-title">
              <h2 :title="task.kind === 'file' ? task.path : task.text">
                <span class="file-title__name">{{ task.name }}</span>
              </h2>
              <p :title="task.kind === 'file' ? task.path : task.text">{{ getTaskMeta(task) }}</p>
            </div>
            <div class="task-card__tools">
              <span class="file-size">{{ getTaskSize(task) }}</span>
              <button
                v-if="task.status === 'done'"
                class="copy-button"
                type="button"
                title="复制该项全部 Hash"
                @click="copyTaskHashes(task)"
              >
                {{ copiedKey === `${task.id}-all` ? '已复制' : '复制全部' }}
              </button>
            </div>
          </div>

          <div class="progress-meta">
            <span>{{ getStatusText(task) }}</span>
            <span>{{ task.progress }}%</span>
          </div>
          <div
            class="progress-track"
            role="progressbar"
            :aria-valuenow="task.progress"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-label="`${task.name} 计算进度`"
          >
            <div class="progress-fill" :style="{ width: `${task.progress}%` }"></div>
          </div>

          <dl class="hash-list">
            <div v-for="algorithm in task.algorithms" :key="algorithm" class="hash-row">
              <dt>{{ HASH_ALGORITHM_LABELS[algorithm] }}</dt>
              <dd>
                <button
                  type="button"
                  class="hash-value"
                  :class="{ 'is-interactive': task.status === 'done' }"
                  :disabled="task.status !== 'done'"
                  :title="getHashValue(task, algorithm)"
                  @click="task.status === 'done' && copyHash(task, algorithm)"
                >
                  {{ getHashValue(task, algorithm) }}
                </button>
                <button
                  type="button"
                  class="case-toggle"
                  :class="{ 'is-disabled': !isRowCaseToggleEnabled(task) }"
                  :aria-disabled="isRowCaseToggleEnabled(task) ? 'false' : 'true'"
                  :aria-label="getRowCaseToggleLabel(task, algorithm)"
                  :tabindex="isRowCaseToggleEnabled(task) ? 0 : -1"
                  :title="isRowCaseToggleEnabled(task) ? getRowCaseToggleLabel(task, algorithm) : '计算完成后可切换大小写'"
                  @click="toggleRowCase(task, algorithm)"
                  @keydown.enter.prevent="toggleRowCase(task, algorithm)"
                  @keydown.space.prevent="toggleRowCase(task, algorithm)"
                >{{ getRowCase(task, algorithm) === 'uppercase' ? 'Aa' : 'aa' }}</button>
                <span
                  v-if="task.status === 'done' && copiedKey === `${task.id}-${algorithm}`"
                  class="copied-flag"
                  role="status"
                  aria-live="polite"
                >已复制</span>
              </dd>
            </div>
          </dl>
        </article>
      </section>

      <div v-if="isDragging && route === 'main'" class="drop-overlay" aria-hidden="true">
        <div class="drop-overlay__panel">松开以开始计算文件 Hash</div>
      </div>

      <div v-if="warningVisible" class="modal-layer" role="presentation">
        <section class="warning-dialog" role="dialog" aria-modal="true" aria-labelledby="large-file-title">
          <p class="eyebrow">大文件提醒</p>
          <h2 id="large-file-title">计算可能需要较长时间</h2>
          <p>
            本次选择 {{ warningSummary.count }} 个文件，共
            {{ formatBytes(warningSummary.totalSize) }}。插件会使用流式读取，不会一次性加载整个文件。
          </p>

          <label class="checkbox-row">
            <input v-model="disableFutureWarnings" type="checkbox" />
            <span>不再提醒大文件计算</span>
          </label>

          <div class="dialog-actions">
            <button class="secondary-button" type="button" @click="cancelWarning">取消</button>
            <button class="primary-button" type="button" @click="continueAfterWarning">继续计算</button>
          </div>
        </section>
      </div>

      <Transition name="completion-toast">
        <p
          v-if="completionToast"
          class="completion-toast"
          :class="`is-${completionToastTone}`"
          role="status"
          aria-live="polite"
        >
          {{ completionToast }}
        </p>
      </Transition>
    </template>

    <template v-else>
      <header class="settings-header">
        <button class="icon-button" type="button" @click="closeSettings">← 返回</button>
      </header>

      <section class="settings-panel">
        <div class="settings-copy">
          <h2>大文件提醒</h2>
          <p>当单个文件或本次总大小超过阈值时，计算前先提醒。</p>
        </div>

        <label class="switch-row">
          <span>超过阈值时提醒我</span>
          <input
            v-model="settings.largeFileWarningEnabled"
            type="checkbox"
            role="switch"
            @change="saveSettings"
          />
        </label>

        <label class="threshold-row">
          <span>提醒阈值</span>
          <span class="number-field">
            <input
              v-model="thresholdInput"
              type="number"
              min="1"
              max="1024"
              step="1"
              @blur="updateThreshold"
              @change="updateThreshold"
            />
            <strong>GB</strong>
          </span>
        </label>

        <div class="settings-copy settings-copy--section">
          <h2>默认大小写</h2>
          <p>新计算结果首次显示时使用的大小写形式；不影响已显示的结果。</p>
        </div>

        <div class="switch-row" role="radiogroup" aria-label="默认大小写">
          <span>计算结果默认显示</span>
          <span class="segmented">
            <button
              type="button"
              class="segmented__option"
              :class="{ 'is-selected': settings.defaultCase === 'lowercase' }"
              role="radio"
              :aria-checked="settings.defaultCase === 'lowercase' ? 'true' : 'false'"
              @click="setDefaultCase('lowercase')"
            >小写</button>
            <button
              type="button"
              class="segmented__option"
              :class="{ 'is-selected': settings.defaultCase === 'uppercase' }"
              role="radio"
              :aria-checked="settings.defaultCase === 'uppercase' ? 'true' : 'false'"
              @click="setDefaultCase('uppercase')"
            >大写</button>
          </span>
        </div>

        <div class="settings-copy settings-copy--section">
          <h2>额外算法</h2>
          <p>默认只启用 MD5、SHA1、SHA256；勾选后会在下一次计算时生效。</p>
        </div>

        <label v-for="algorithm in EXTRA_HASH_ALGORITHMS" :key="algorithm" class="switch-row">
          <span>{{ HASH_ALGORITHM_LABELS[algorithm] }}</span>
          <input
            type="checkbox"
            role="switch"
            :checked="isExtraAlgorithmEnabled(algorithm)"
            @change="toggleExtraAlgorithm(algorithm, ($event.target as HTMLInputElement).checked)"
          />
        </label>
      </section>
    </template>
  </main>
</template>
