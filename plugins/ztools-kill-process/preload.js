console.log('ztools-kill-process preload.js loaded!');

const ztools = window.ztools || window.utools || {};

window.exports = {
  'kill-process': {
    mode: 'none',
    args: {
      enter() {
        if (ztools.setExpendHeight) ztools.setExpendHeight(580);
        if (ztools.setExploresHeight) ztools.setExploresHeight(580);
        if (ztools.showMainWindow) ztools.showMainWindow();
      },
      leave() {}
    }
  }
};

// Memory formatter helper
function formatMemory(memKB) {
  if (!memKB || isNaN(memKB) || memKB <= 0) return '0 KB';
  if (memKB >= 1024 * 1024) {
    return (memKB / (1024 * 1024)).toFixed(2) + ' GB';
  } else if (memKB >= 1024) {
    return (memKB / 1024).toFixed(1) + ' MB';
  } else {
    return memKB.toLocaleString('en-US') + ' KB';
  }
}

window.services = {
  getProcesses() {
    return new Promise((resolve, reject) => {
      const { execFile } = require('child_process');
      const os = require('os');
      const platform = os.platform();

      if (platform === 'win32') {
        const psScript = `
Get-Process | ForEach-Object {
    [PSCustomObject]@{
        Id = $_.Id;
        ProcessName = $_.ProcessName;
        WorkingSet64 = $_.WorkingSet64
    }
} | ConvertTo-Json -Compress
`;

        const encoded = Buffer.from(psScript, 'utf16le').toString('base64');

        execFile('powershell.exe', ['-NoProfile', '-EncodedCommand', encoded], { encoding: 'utf8', timeout: 5000, maxBuffer: 20 * 1024 * 1024 }, (err, stdout) => {
          if (err) return reject(err);

          try {
            const rawItems = JSON.parse(stdout || '[]');
            const items = Array.isArray(rawItems) ? rawItems : [rawItems];
            const list = [];

            for (const item of items) {
              if (!item || item.Id === undefined || item.Id === 0) continue;
              const rawName = item.ProcessName || '';
              const lowerName = rawName.toLowerCase();

              // Filter out Idle and Memory Compression processes
              if (lowerName === 'idle' || lowerName.includes('memory compression') || lowerName.includes('memorycompression')) {
                continue;
              }

              const pid = item.Id;
              const name = rawName ? `${rawName}.exe` : `PID-${pid}`;
              const memoryKB = Math.round((item.WorkingSet64 || 0) / 1024);

              list.push({
                name,
                pid,
                memoryStr: formatMemory(memoryKB),
                memoryKB
              });
            }

            resolve(list);
          } catch (e) {
            reject(e);
          }
        });
      } else {
        // macOS / Linux
        execFile('ps', ['-ax', '-o', 'pid,rss,comm'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 5000 }, (err, stdout) => {
          if (err) return reject(err);
          const lines = stdout.split('\n').slice(1);
          const list = [];
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 3) {
              const pid = parseInt(parts[0], 10);
              const rssKB = parseInt(parts[1], 10) || 0;
              const comm = parts.slice(2).join(' ');
              if (!isNaN(pid) && comm) {
                const name = comm.split('/').pop();
                if (name.toLowerCase().includes('memory compression')) continue;
                list.push({
                  name,
                  pid,
                  memoryStr: formatMemory(rssKB),
                  memoryKB: rssKB
                });
              }
            }
          }
          resolve(list);
        });
      }
    });
  },

  killProcess(pid, force = true) {
    return new Promise((resolve, reject) => {
      const { execFile } = require('child_process');
      const os = require('os');
      const platform = os.platform();

      if (platform === 'win32') {
        const args = force ? ['/F', '/PID', pid.toString()] : ['/PID', pid.toString()];
        execFile('taskkill.exe', args, { encoding: 'utf8', timeout: 5000 }, (err, stdout, stderr) => {
          if (err) {
            const msg = stderr || stdout || err.message || '结束进程失败';
            return reject(new Error(msg));
          }
          resolve(stdout || '成功杀死进程');
        });
      } else {
        execFile('kill', ['-9', pid.toString()], { encoding: 'utf8', timeout: 5000 }, (err, stdout, stderr) => {
          if (err) {
            const msg = stderr || stdout || err.message || '结束进程失败';
            return reject(new Error(msg));
          }
          resolve(stdout || '成功杀死进程');
        });
      }
    });
  }
};
