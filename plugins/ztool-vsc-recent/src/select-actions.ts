/**
 * 选中条目后，根据 launcher 返回值决定要对 ztools host 做哪些动作。
 * 纯函数，与 DOM 无关，便于单测。renderer (index.ts) 内联等价逻辑。
 */
export type LaunchResult = { ok: true } | { ok: false; reason: string };

export type SelectAction =
  | { kind: 'close-host' }       // hideMainWindow(false) + outPlugin()
  | { kind: 'notify'; message: string };

const PATH_HINT =
  '。请确认 PATH 中包含 code 命令（在 VSCode 中按 Ctrl+Shift+P 运行 "Shell Command: Install code command in PATH"）。';

export function decideSelectActions(r: LaunchResult): SelectAction[] {
  if (r.ok) {
    return [{ kind: 'close-host' }];
  }
  return [{ kind: 'notify', message: '无法启动 VSCode：' + r.reason + PATH_HINT }];
}
