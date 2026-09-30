import { describe, expect, it, vi } from 'vitest';
vi.mock('electron', () => ({ shell: { openExternal: vi.fn() } }));
import { validateChatAction } from '../../src/main/chat';
import { mergeMessages } from '../../src/renderer/features/chat/Chat';
import type { ChatMessage } from '../../src/shared/ipc/contracts';

describe('chat boundary', () => {
  it('rejects arbitrary routes, invalid IDs, oversized bodies and unsafe links', () => {
    for (const action of [{kind: 'fetch', url: 'https://attacker.test'}, {kind: 'history', channelId: '../auth/config'}, {kind: 'openLink', url: 'file:///C:/secret'}, {kind: 'openLink', url: 'https://user:pass@example.com'}, {kind: 'send', channelId: crypto.randomUUID(), clientId: crypto.randomUUID(), body: 'x'.repeat(4001)}]) expect(() => validateChatAction(action)).toThrow();
    expect(() => validateChatAction({kind: 'history', channelId: crypto.randomUUID(), before: '9007199254740993'})).not.toThrow();
    expect(() => validateChatAction({kind: 'openLink', url: 'https://example.com'})).not.toThrow();
  });
  it('deduplicates history and keeps the newer version with bigint ordering', () => {
    const message = { id: '9007199254740993', version: 2, body: 'new' } as ChatMessage;
    const result = mergeMessages([message], [{...message, version: 1, body: 'old'}, {...message, id: '9007199254740992'}]);
    expect(result.map(item => item.id)).toEqual(['9007199254740992', '9007199254740993']);
    expect(result[1].body).toBe('new');
  });
});
