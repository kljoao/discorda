import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const encryption = vi.hoisted(() => ({ enabled: true }));
vi.mock('electron', () => ({ safeStorage: {
  isEncryptionAvailable: () => encryption.enabled,
  getSelectedStorageBackend: () => 'gnome_libsecret',
  encryptString: (value: string) => Buffer.from(Buffer.from(value).toString('base64')),
  decryptString: (value: Buffer) => Buffer.from(value.toString(), 'base64').toString(),
} }));
import { SessionVault } from '../../src/main/auth/session-vault';

describe('session vault uses the OS encryption boundary', () => {
  let directory: string;
  let filename: string;
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'discorda-vault-test-'));
    filename = path.join(directory, 'session.enc');
    encryption.enabled = true;
  });
  afterEach(async () => { await rm(filename, { force: true }); await rm(filename + '.tmp', { force: true }); await rmdir(directory); });
  it('persists Supabase credentials through encryption and drops Google provider tokens', async () => {
    const vault = new SessionVault(filename);
    await vault.setItem('session', JSON.stringify({ access_token: 'access-secret', refresh_token: 'refresh-secret', provider_token: 'google-secret', provider_refresh_token: 'google-refresh' }));
    const disk = await readFile(filename, 'utf8');
    expect(disk).not.toContain('access-secret');
    const restored = await new SessionVault(filename).getItem('session');
    expect(restored).toContain('refresh-secret');
    expect(restored).not.toContain('google');
    await vault.clear();
    expect(await new SessionVault(filename).getItem('session')).toBeNull();
  });
  it('does not persist without a secure OS store', async () => {
    encryption.enabled = false;
    const vault = new SessionVault(filename);
    await vault.setItem('session', 'memory-only');
    expect(await vault.getItem('session')).toBe('memory-only');
    await expect(readFile(filename)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await new SessionVault(filename).getItem('session')).toBeNull();
  });
});
