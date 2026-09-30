import { describe, it, expect, vi } from 'vitest';
vi.mock('electron', () => ({ desktopCapturer: {}, session: {} }));
import { validateMediaAction } from '../../src/main/media';
describe('media IPC boundary', () => {
  const channelId = 'bde069ed-d1c4-4930-92d3-9360eab43cb8';
  it('accepts only fixed actions and UUIDs, requiring a lease for renewal/leave', () => {
    expect(() => validateMediaAction({kind:'join',channelId})).not.toThrow();
    expect(() => validateMediaAction({kind:'pulse',channelId,leaseId:channelId})).not.toThrow();
    for (const value of [{kind:'pulse',channelId}, {kind:'leave',channelId,leaseId:'../admin'}, {kind:'join',channelId:'https://evil.test'}, {kind:'admin',channelId}, null]) expect(() => validateMediaAction(value)).toThrow();
  });
});
