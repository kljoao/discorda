import path from 'node:path';

export const APP_URL = 'app://discorda/index.html';
export const DEV_URL = 'http://127.0.0.1:5173';

export function isTrustedDocument(url: string, development: boolean): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) return false;
    if (development) return parsed.origin === DEV_URL;
    return parsed.protocol === 'app:' && parsed.hostname === 'discorda' && !parsed.port;
  } catch {
    return false;
  }
}

export function resolveAssetPath(root: string, rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (!isTrustedDocument(rawUrl, false) || url.search) return null;
    const name = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    // Reject Windows separators, drive/ADS paths and traversal before resolution.
    if (name.includes('\\') || name.includes(':') || name.includes('\0') || name.split('/').includes('..')) return null;
    const target = path.resolve(root, '.' + name);
    const relative = path.relative(root, target);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
    return target;
  } catch {
    return null;
  }
}

export function validateIpcCall(input: {
  senderId: number;
  windowId: number;
  mainFrame: boolean;
  url: string;
  development: boolean;
  args: unknown[];
}): void {
  if (input.senderId !== input.windowId || !input.mainFrame ||
      !isTrustedDocument(input.url, input.development) || input.args.length !== 0) {
    throw new Error('IPC request rejected');
  }
}
