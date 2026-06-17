"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decideSelectActions = decideSelectActions;
const PATH_HINT = '。请确认 PATH 中包含 code 命令（在 VSCode 中按 Ctrl+Shift+P 运行 "Shell Command: Install code command in PATH"）。';
function decideSelectActions(r) {
    if (r.ok) {
        return [{ kind: 'close-host' }];
    }
    if ('ipcError' in r) {
        return [{ kind: 'notify', message: '启动 VSCode 失败（IPC 异常）：' + r.ipcError }];
    }
    return [{ kind: 'notify', message: '无法启动 VSCode：' + r.reason + PATH_HINT }];
}
