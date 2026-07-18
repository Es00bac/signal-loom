import { describe, expect, it, vi } from 'vitest';
import type { NativePreparedProjectSwitchResult, SignalLoomNativeBridge } from './nativeApp';
import { requestStartupProjectRecoveryAction } from './startupProjectRecovery';

function prepared(filePath: string): NativePreparedProjectSwitchResult {
  return { canceled: false, filePath, transactionId: 'switch-1' };
}

function bridge() {
  return {
    dismissStartupProjectRecovery: vi.fn(async () => ({ ok: true })),
    openProjectFile: vi.fn(async () => prepared('/projects/another.sloom')),
    recoverStartupProjectBackup: vi.fn(async () => prepared('/projects/original.sloom.bak-new')),
    retryStartupProject: vi.fn(async () => prepared('/projects/original.sloom')),
  } satisfies Pick<
    SignalLoomNativeBridge,
    'dismissStartupProjectRecovery' | 'openProjectFile' | 'recoverStartupProjectBackup' | 'retryStartupProject'
  >;
}

describe('startup project recovery actions', () => {
  it('retries the remembered path through a prepared project switch', async () => {
    const native = bridge();
    await expect(requestStartupProjectRecoveryAction({ action: 'retry', bridge: native })).resolves.toMatchObject({
      status: 'prepared',
      result: { filePath: '/projects/original.sloom', transactionId: 'switch-1' },
    });
    expect(native.retryStartupProject).toHaveBeenCalledWith({ claim: undefined });
  });

  it('opens another project through the normal native file chooser', async () => {
    const native = bridge();
    await expect(requestStartupProjectRecoveryAction({ action: 'open-another', bridge: native })).resolves.toMatchObject({
      status: 'prepared',
      result: { filePath: '/projects/another.sloom' },
    });
    expect(native.openProjectFile).toHaveBeenCalledOnce();
  });

  it('leaves recovery open when Open Another is canceled', async () => {
    const native = bridge();
    native.openProjectFile.mockResolvedValueOnce({ canceled: true });
    await expect(requestStartupProjectRecoveryAction({ action: 'open-another', bridge: native })).resolves.toEqual({
      status: 'prepared',
      result: { canceled: true },
    });
    expect(native.dismissStartupProjectRecovery).not.toHaveBeenCalled();
  });

  it('prepares only the selected discovered backup', async () => {
    const native = bridge();
    await requestStartupProjectRecoveryAction({
      action: 'recover-backup',
      bridge: native,
      backupPath: '/projects/original.sloom.bak-new',
    });
    expect(native.recoverStartupProjectBackup).toHaveBeenCalledWith({
      filePath: '/projects/original.sloom.bak-new',
      claim: undefined,
    });
  });

  it('continues blank without opening a file or erasing persistent state in the renderer', async () => {
    const native = bridge();
    await expect(requestStartupProjectRecoveryAction({ action: 'continue-blank', bridge: native })).resolves.toEqual({
      status: 'dismissed',
    });
    expect(native.dismissStartupProjectRecovery).toHaveBeenCalledOnce();
    expect(native.openProjectFile).not.toHaveBeenCalled();
    expect(native.retryStartupProject).not.toHaveBeenCalled();
  });
});
