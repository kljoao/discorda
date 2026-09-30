import { safeStorage } from 'electron';
import { readFile, writeFile, rename, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

export class SessionVault {
  private values: Record<string, string> = {};
  private loaded = false;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly filename: string) {}

  private get secure() {
    return safeStorage.isEncryptionAvailable() && (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text');
  }
  private serial<T>(action: () => Promise<T>): Promise<T> {
    const result = this.queue.then(action);
    this.queue = result.catch(() => undefined);
    return result;
  }
  private async load() {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.secure) return;
    try {
      const encrypted = await readFile(this.filename);
      if (encrypted.length > 1_048_576) return;
      const value: unknown = JSON.parse(safeStorage.decryptString(encrypted));
      if (value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(item => typeof item === 'string'))
        this.values = value as Record<string, string>;
    } catch { this.values = {}; }
  }
  private async save() {
    if (!this.secure) return; // Session is intentionally memory-only without an OS key store.
    await mkdir(path.dirname(this.filename), { recursive: true });
    await writeFile(this.filename + '.tmp', safeStorage.encryptString(JSON.stringify(this.values)), { mode: 0o600 });
    await rename(this.filename + '.tmp', this.filename);
  }
  getItem(key: string): Promise<string | null> {
    return this.serial(async () => { await this.load(); return Object.hasOwn(this.values, key) ? this.values[key] : null; });
  }
  setItem(key: string, value: string): Promise<void> {
    return this.serial(async () => {
      await this.load();
      // Google provider credentials are unnecessary after Supabase creates its session.
      try {
        const session = JSON.parse(value);
        if (session && typeof session === 'object' && !Array.isArray(session)) {
          delete session.provider_token;
          delete session.provider_refresh_token;
          value = JSON.stringify(session);
        }
      } catch { /* PKCE verifier strings are not session JSON. */ }
      this.values[key] = value;
      await this.save();
    });
  }
  removeItem(key: string): Promise<void> {
    return this.serial(async () => { await this.load(); delete this.values[key]; await this.save(); });
  }
  clear(): Promise<void> {
    return this.serial(async () => { this.values = {}; this.loaded = true; await rm(this.filename, { force: true }); await rm(this.filename + '.tmp', { force: true }); });
  }
}
