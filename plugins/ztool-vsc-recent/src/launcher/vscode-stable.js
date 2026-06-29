"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openInVSCode = openInVSCode;
const child_process_1 = require("child_process");
/**
 * 用 PATH 上的 `code` 命令打开项目。
 * Windows 下 PATH 中的 code 是 code.cmd，所以必须 shell: true。
 */
function openInVSCode(item) {
    return new Promise(resolve => {
        let settled = false;
        const settle = (r) => { if (!settled) {
            settled = true;
            resolve(r);
        } };
        try {
            const isWin = (typeof ztools !== 'undefined' && typeof ztools.isWindows === 'function')
                ? ztools.isWindows()
                : process.platform === 'win32';
            const isMac = (typeof ztools !== 'undefined' && typeof ztools.isMacOs === 'function')
                ? ztools.isMacOs()
                : (typeof ztools !== 'undefined' && typeof ztools.isMacOS === 'function')
                    ? ztools.isMacOS()
                    : process.platform === 'darwin';
            let cmd;
            let finalArgs;
            let useShell;
            const env = { ...process.env };
            if (isMac) {
                // macOS 平台最佳实践：直接无视环境路径，利用 Bundle ID 原生唤醒应用
                cmd = 'open';
                useShell = false;
                finalArgs = item.kind === 'remote'
                    ? ['-b', 'com.microsoft.VSCode', '--args', '--folder-uri', item.rawPath]
                    : ['-b', 'com.microsoft.VSCode', item.rawPath];
            }
            else {
                // Windows / Linux 依赖 code 命令唤起
                cmd = 'code';
                useShell = isWin; // Windows 下开启 shell 兼容 code.cmd
                finalArgs = item.kind === 'remote'
                    ? ['--folder-uri', useShell ? quoteIfNeeded(item.rawPath) : item.rawPath]
                    : [useShell ? quoteIfNeeded(item.rawPath) : item.rawPath];
                if (!isWin) {
                    // 为 Linux 等环境尽力补全常规 PATH
                    const extraPaths = ['/usr/local/bin', '/usr/bin', '/bin'];
                    env.PATH = env.PATH ? `${extraPaths.join(':')}:${env.PATH}` : extraPaths.join(':');
                }
            }
            const child = (0, child_process_1.spawn)(cmd, finalArgs, { env, detached: true, stdio: 'ignore', shell: useShell });
            child.on('error', e => settle({ ok: false, reason: e.message }));
            child.on('exit', code => {
                if (code !== 0 && code !== null) {
                    settle({ ok: false, reason: `进程异常退出(code:${code})，请检查是否已安装或环境变量配置错误` });
                }
            });
            child.unref();
            // 给 spawn 一定时间触发错误或退出的事件，若 100ms 内没报错则假定成功
            setTimeout(() => settle({ ok: true }), 100);
        }
        catch (e) {
            const reason = e instanceof Error ? e.message : String(e);
            settle({ ok: false, reason });
        }
    });
}
/**
 * shell:true 下含空格的路径需要带双引号。
 */
function quoteIfNeeded(p) {
    if (p.includes('"'))
        return p; // 不重复加
    if (/[\s&()]/.test(p))
        return `"${p}"`;
    return p;
}
