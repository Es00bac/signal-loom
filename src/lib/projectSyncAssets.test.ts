import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  android: { value: false },
  served: { value: false },
  fetch: vi.fn(),
}));

vi.mock('./androidLanServer', () => ({
  isAndroidLanServerAvailable: () => h.android.value,
}));
vi.mock('./remoteHostClient', () => ({
  isServedLanSession: () => h.served.value,
  remoteHostFetch: (...args: unknown[]) => h.fetch(...args),
}));

import { prepareVerifiedProjectSyncAssets, putVerifiedProjectSyncAsset } from './projectSyncAssets';
import { getHostProjectSyncAsset, resetProjectSyncLog } from './projectSyncService';

beforeEach(() => {
  h.android.value = false;
  h.served.value = false;
  h.fetch.mockReset();
  resetProjectSyncLog();
});

describe('putVerifiedProjectSyncAsset', () => {
  it('records directly on the authority and reports success', async () => {
    h.android.value = true;
    await expect(putVerifiedProjectSyncAsset('paper', 'sha256:abc', 'data:application/octet-stream;base64,AQ=='))
      .resolves.toBe(true);
    expect(getHostProjectSyncAsset('paper', 'sha256:abc')).toBe('data:application/octet-stream;base64,AQ==');
  });

  it('requires a served authority acknowledgement', async () => {
    h.served.value = true;
    h.fetch.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false });
    await expect(putVerifiedProjectSyncAsset('paper', 'one', 'data:application/octet-stream;base64,AQ=='))
      .resolves.toBe(true);
    await expect(putVerifiedProjectSyncAsset('paper', 'two', 'data:application/octet-stream;base64,Ag=='))
      .resolves.toBe(false);
  });

  it('fails closed off-session and when transport rejects', async () => {
    await expect(putVerifiedProjectSyncAsset('paper', 'one', 'data:application/octet-stream;base64,AQ=='))
      .resolves.toBe(false);
    h.served.value = true;
    h.fetch.mockRejectedValueOnce(new Error('offline'));
    await expect(putVerifiedProjectSyncAsset('paper', 'one', 'data:application/octet-stream;base64,AQ=='))
      .resolves.toBe(false);
  });
});

describe('prepareVerifiedProjectSyncAssets', () => {
  it('pins the complete authority inventory before byte publication', async () => {
    h.android.value = true;
    await expect(prepareVerifiedProjectSyncAssets('paper', ['one', 'two'])).resolves.toBe(true);
    // A subsequently inserted pinned member remains normally fetchable.
    await putVerifiedProjectSyncAsset('paper', 'one', 'data:application/octet-stream;base64,AQ==');
    expect(getHostProjectSyncAsset('paper', 'one')).toBe('data:application/octet-stream;base64,AQ==');
  });

  it('requires served acknowledgement and fails closed off-session', async () => {
    await expect(prepareVerifiedProjectSyncAssets('paper', [])).resolves.toBe(false);
    h.served.value = true;
    h.fetch.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false });
    await expect(prepareVerifiedProjectSyncAssets('paper', ['one'])).resolves.toBe(true);
    await expect(prepareVerifiedProjectSyncAssets('paper', ['two'])).resolves.toBe(false);
  });
});
