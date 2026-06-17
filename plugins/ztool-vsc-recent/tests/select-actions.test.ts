import { describe, it, expect } from 'vitest';
import { decideSelectActions } from '../src/select-actions';

describe('decideSelectActions', () => {
  it('on success: closes host (hideMainWindow + outPlugin)', () => {
    const actions = decideSelectActions({ ok: true });
    expect(actions).toEqual([{ kind: 'close-host' }]);
  });

  it('on success: emits exactly one action (no duplicate close)', () => {
    const actions = decideSelectActions({ ok: true });
    expect(actions.length).toBe(1);
  });

  it('on failure: notifies with reason + PATH hint, does NOT close host', () => {
    const actions = decideSelectActions({ ok: false, reason: 'spawn ENOENT' });
    expect(actions.length).toBe(1);
    expect(actions[0].kind).toBe('notify');
    if (actions[0].kind === 'notify') {
      expect(actions[0].message).toContain('spawn ENOENT');
      expect(actions[0].message).toContain('Shell Command: Install code command in PATH');
    }
    // Regression: must not close ztool main window when launch failed.
    expect(actions.find((a) => a.kind === 'close-host')).toBeUndefined();
  });

  it('on failure: empty reason still produces well-formed message', () => {
    const actions = decideSelectActions({ ok: false, reason: '' });
    expect(actions[0].kind).toBe('notify');
  });

  it('on IPC error: notifies with ipc-error prefix, does NOT close host', () => {
    const actions = decideSelectActions({ ok: false, ipcError: 'channel closed' });
    expect(actions.length).toBe(1);
    expect(actions[0].kind).toBe('notify');
    if (actions[0].kind === 'notify') {
      expect(actions[0].message).toContain('IPC 异常');
      expect(actions[0].message).toContain('channel closed');
      // No PATH hint for IPC errors — root cause is the channel, not the user's PATH.
      expect(actions[0].message).not.toContain('Install code command');
    }
    expect(actions.find((a) => a.kind === 'close-host')).toBeUndefined();
  });
});
