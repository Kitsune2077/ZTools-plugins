<script setup lang="ts">
import { computed, reactive, watch } from "vue";

import type { PrivacySettings } from "../../preload/privacy";
import type { ShelfDockEdge, WindowPreferences } from "../../preload/window-preferences";
import {
  blobBudgetBytes,
  blobBudgetInputConstraints,
  blobBudgetUnits,
  blobBudgetValue,
  preferredBlobBudgetUnit,
  type BlobBudgetUnit,
} from "../blob-budget";
import {
  lines,
  parseContentRules,
  parseLines,
  serializeContentRules,
} from "../privacy-view";

const props = defineProps<{
  settings: PrivacySettings;
  saving: boolean;
  standalone?: boolean;
  windowPreferences: WindowPreferences;
}>();
const emit = defineEmits<{
  close: [];
  save: [settings: PrivacySettings, windowPreferences: WindowPreferences];
}>();
const dockOptions: readonly (readonly [ShelfDockEdge, string])[] = [
  ["bottom", "下方"],
  ["top", "上方"],
  ["left", "左侧"],
  ["right", "右侧"],
];
const initialBlobBudgetUnit = preferredBlobBudgetUnit(
  props.settings.retention.maxBlobBytes,
);

const form = reactive({
  ignoredBundleIds: lines(props.settings.rules.ignoredBundleIds),
  contentRules: serializeContentRules(props.settings.rules.contentRules),
  blockLikelySecrets: props.settings.rules.blockLikelySecrets,
  retentionDays: props.settings.retention.days,
  maxBlobValue: blobBudgetValue(
    props.settings.retention.maxBlobBytes,
    initialBlobBudgetUnit,
  ),
  maxBlobUnit: initialBlobBudgetUnit,
  screenShareProtection: props.settings.screenShareProtection,
  dockEdge: props.windowPreferences.dockEdge as ShelfDockEdge,
});
const blobBudgetConstraints = computed(() =>
  blobBudgetInputConstraints(form.maxBlobUnit),
);

watch(
  () => props.settings,
  (settings) => {
    form.ignoredBundleIds = lines(settings.rules.ignoredBundleIds);
    form.contentRules = serializeContentRules(settings.rules.contentRules);
    form.blockLikelySecrets = settings.rules.blockLikelySecrets;
    form.retentionDays = settings.retention.days;
    form.maxBlobUnit = preferredBlobBudgetUnit(settings.retention.maxBlobBytes);
    form.maxBlobValue = blobBudgetValue(
      settings.retention.maxBlobBytes,
      form.maxBlobUnit,
    );
    form.screenShareProtection = settings.screenShareProtection;
  },
);

watch(
  () => props.windowPreferences,
  (settings) => {
    form.dockEdge = settings.dockEdge;
  },
);

function save(): void {
  emit(
    "save",
    {
      pause: props.settings.pause,
      rules: {
        ignoredBundleIds: parseLines(form.ignoredBundleIds),
        blockLikelySecrets: form.blockLikelySecrets,
        contentRules: parseContentRules(form.contentRules),
      },
      retention: {
        days: Math.round(form.retentionDays),
        maxBlobBytes: blobBudgetBytes(form.maxBlobValue, form.maxBlobUnit),
      },
      screenShareProtection: form.screenShareProtection,
    },
    { dockEdge: form.dockEdge },
  );
}

function updateBlobBudgetUnit(event: Event): void {
  const select = event.target;
  if (!(select instanceof HTMLSelectElement)) return;
  const nextUnit = select.value as BlobBudgetUnit;
  if (!blobBudgetUnits.includes(nextUnit) || nextUnit === form.maxBlobUnit) return;
  const bytes = blobBudgetBytes(form.maxBlobValue, form.maxBlobUnit);
  form.maxBlobUnit = nextUnit;
  form.maxBlobValue = blobBudgetValue(bytes, nextUnit);
}
</script>

<template>
  <div class="settings-backdrop" :class="{ 'settings-backdrop--standalone': standalone }" @click.self="emit('close')">
    <section class="settings-panel glass-surface" aria-labelledby="privacy-title">
      <header>
        <div><p>Local Privacy</p><h2 id="privacy-title">隐私与历史保留</h2></div>
        <button type="button" aria-label="关闭隐私设置" @click="emit('close')">×</button>
      </header>
      <form @submit.prevent="save">
        <label class="toggle">
          <span><strong>自动排除高置信度秘密</strong><small>令牌、私钥和已知凭据格式在写入历史前过滤</small></span>
          <input v-model="form.blockLikelySecrets" type="checkbox" />
        </label>
        <fieldset class="dock-field">
          <legend>显示位置</legend>
          <div class="dock-options">
            <label v-for="option in dockOptions" :key="option[0]">
              <input v-model="form.dockEdge" type="radio" name="dock-edge" :value="option[0]" />
              <span>{{ option[1] }}</span>
            </label>
          </div>
          <small>每次唤起都会贴在当前鼠标所在屏幕的对应边缘。</small>
        </fieldset>
        <label class="toggle">
          <span><strong>屏幕共享时隐藏浮窗</strong><small>使用 Electron content protection，保存后立即应用</small></span>
          <input v-model="form.screenShareProtection" type="checkbox" />
        </label>
        <div class="grid">
          <label><span>普通历史保留天数</span><input v-model.number="form.retentionDays" type="number" min="1" max="3650" /></label>
          <label>
            <span>附件预算</span>
            <div class="budget-control">
              <input
                v-model.number="form.maxBlobValue"
                aria-label="附件预算数值"
                type="number"
                :min="blobBudgetConstraints.min"
                :max="blobBudgetConstraints.max"
                :step="blobBudgetConstraints.step"
                required
              />
              <select
                aria-label="附件预算单位"
                :value="form.maxBlobUnit"
                @change="updateBlobBudgetUnit"
              >
                <option v-for="unit in blobBudgetUnits" :key="unit" :value="unit">{{ unit }}</option>
              </select>
            </div>
          </label>
        </div>
        <label class="field"><span>排除应用 Bundle ID（每行一个）</span><textarea v-model="form.ignoredBundleIds" rows="3" spellcheck="false" /></label>
        <label class="field"><span>内容规则（literal: / wildcard: / regex:）</span><textarea v-model="form.contentRules" rows="3" spellcheck="false" placeholder="literal:PRIVATE NOTE&#10;wildcard:otp-*&#10;regex:^internal-[0-9]+$/i" /></label>
        <p class="hint">隐私规则在元数据和附件落盘前执行；分组与固定内容不会被普通保留策略静默删除。</p>
        <footer>
          <button type="button" class="quiet" @click="emit('close')">取消</button>
          <button type="submit" class="primary" :disabled="saving">{{ saving ? "正在保存…" : "保存设置" }}</button>
        </footer>
      </form>
    </section>
  </div>
</template>

<style scoped>
.settings-backdrop { position:absolute; inset:0; z-index:21; display:grid; padding:12px; place-items:center; background:color-mix(in srgb,#171521 28%,transparent); backdrop-filter:blur(10px); }
.settings-backdrop--standalone { padding:0; background:var(--pb-window-bg); backdrop-filter:none; }
.settings-backdrop--standalone .settings-panel { width:100%; height:100%; max-height:100%; border:0; border-radius:0; background:var(--pb-window-bg); box-shadow:none; }
.settings-panel { width:min(650px,100%); max-height:calc(100% - 8px); overflow:auto; border:1px solid var(--pb-line); border-radius:20px; background:color-mix(in srgb,var(--pb-glass-strong) 94%,transparent); box-shadow:0 28px 80px rgb(25 20 43 / 32%); }
header { display:flex; align-items:flex-start; justify-content:space-between; padding:20px 22px 14px; } header p { margin:0 0 4px; color:var(--pb-violet); font-size:10px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; } h2 { margin:0; font-size:20px; } header button { width:30px; height:30px; border:0; border-radius:50%; background:color-mix(in srgb,var(--pb-line) 60%,transparent); color:var(--pb-muted); cursor:pointer; font-size:20px; }
form { padding:0 22px 20px; }.toggle { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:13px 0; border-top:1px solid var(--pb-line); }.toggle span { display:grid; gap:3px; }.toggle strong { font-size:12px; }.toggle small,.hint { color:var(--pb-muted); font-size:10px; line-height:1.5; }.toggle input { width:32px; accent-color:var(--pb-violet); }
.dock-field { display:grid; gap:8px; margin:0; padding:13px 0; border:0; border-top:1px solid var(--pb-line); }.dock-field legend { padding:0; font-size:12px; font-weight:700; }.dock-field small { color:var(--pb-muted); font-size:10px; }.dock-options { display:grid; grid-template-columns:repeat(4,1fr); gap:7px; }.dock-options label { position:relative; }.dock-options input { position:absolute; opacity:0; pointer-events:none; }.dock-options span { display:grid; min-height:34px; border:1px solid var(--pb-line); border-radius:10px; background:color-mix(in srgb,var(--pb-glass-strong) 58%,transparent); color:var(--pb-muted); cursor:pointer; font-size:11px; font-weight:700; place-items:center; }.dock-options input:checked + span { border-color:var(--pb-violet); background:color-mix(in srgb,var(--pb-violet) 12%,var(--pb-window-bg)); color:var(--pb-violet); }.dock-options input:focus-visible + span { outline:2px solid color-mix(in srgb,var(--pb-violet) 45%,transparent); outline-offset:1px; }
.grid { display:grid; grid-template-columns:1fr 1fr; gap:11px; padding:12px 0; }.grid label,.field { display:grid; gap:6px; }.grid span,.field span { color:var(--pb-muted); font-size:10px; font-weight:700; } input[type="number"],textarea { width:100%; padding:9px 11px; border:1px solid var(--pb-line); border-radius:10px; outline:none; background:color-mix(in srgb,var(--pb-glass-strong) 58%,transparent); color:var(--pb-ink); } textarea { resize:vertical; font:11px/1.45 "SFMono-Regular",Consolas,monospace; }.field { margin-top:11px; }
.budget-control { display:grid; grid-template-columns:minmax(0,1fr) 84px; overflow:hidden; border:1px solid var(--pb-line); border-radius:10px; background:color-mix(in srgb,var(--pb-glass-strong) 58%,transparent); transition:border-color 140ms ease,box-shadow 140ms ease; }.budget-control:focus-within { border-color:var(--pb-violet); box-shadow:0 0 0 3px color-mix(in srgb,var(--pb-violet) 14%,transparent); }.budget-control input[type="number"] { min-width:0; border:0; border-radius:0; background:transparent; }.budget-control select { min-width:0; padding:0 10px; border:0; border-left:1px solid var(--pb-line); outline:0; background:color-mix(in srgb,var(--pb-violet) 7%,transparent); color:var(--pb-ink); cursor:pointer; font:700 11px/1 system-ui,sans-serif; }
footer { display:flex; gap:8px; justify-content:flex-end; margin-top:16px; } footer button { min-height:36px; padding:0 14px; border:1px solid var(--pb-line); border-radius:11px; cursor:pointer; font-weight:700; }.quiet { background:transparent; color:var(--pb-muted); }.primary { border-color:transparent; background:var(--pb-violet); color:white; }.primary:disabled { cursor:wait; opacity:.55; }
@media (max-width:620px) { .grid { grid-template-columns:1fr; } }
</style>
