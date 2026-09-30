import { describe, expect, it } from 'vitest';
import { resolveAssetPath, isTrustedDocument, validateIpcCall } from '../../src/main/security';
import { validateApiUrl } from '../../src/main/services';
import path from 'node:path';

describe('renderer trust boundary', () => {
  it('rejects foreign origins, credentials and production development origins', () => {
    for (const url of ['https://discorda', 'app://evil/index.html', 'app://user@discorda/index.html', 'http://127.0.0.1:5173']) {
      expect(isTrustedDocument(url, false)).toBe(false);
    }
    expect(isTrustedDocument('app://discorda/index.html', false)).toBe(true);
    expect(isTrustedDocument('http://127.0.0.1:5173', true)).toBe(true);
    expect(isTrustedDocument('http://127.0.0.1:5173.evil.test', true)).toBe(false);
  });
  it('rejects IPC from subframes, other windows, foreign documents and unexpected arguments', () => {
    const allowed = { senderId: 1, windowId: 1, mainFrame: true, url: 'app://discorda/index.html', development: false, args: [] };
    expect(() => validateIpcCall(allowed)).not.toThrow();
    for (const override of [{ senderId: 2 }, { mainFrame: false }, { url: 'https://evil.test' }, { args: ['payload'] }]) {
      expect(() => validateIpcCall({ ...allowed, ...override })).toThrow('IPC request rejected');
    }
  });
  it('prevents encoded path traversal and Windows alternate path syntax', () => {
    const root = path.resolve('renderer');
    for (const url of ['app://discorda/%2e%2e%2fsecret', 'app://discorda/..%5csecret', 'app://discorda/C:%5csecret', 'app://discorda/file:stream', 'app://evil/index.html', 'app://discorda/%00']) {
      expect(resolveAssetPath(root, url)).toBeNull();
    }
    expect(resolveAssetPath(root, 'app://discorda/assets/index.js')).toBe(path.join(root, 'assets/index.js'));
  });
  it('requires HTTPS in packaged apps and never accepts credentials in the origin', () => {
    expect(validateApiUrl('https://api.example.test', true)).toBe('https://api.example.test');
    expect(validateApiUrl('http://127.0.0.1:5080', false)).toBe('http://127.0.0.1:5080');
    for (const url of ['http://127.0.0.1:5080', 'https://user:password@example.test', 'file:///tmp', 'https://example.test/redirect']) {
      expect(() => validateApiUrl(url, true)).toThrow();
    }
  });
});
