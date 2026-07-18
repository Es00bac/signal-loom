import type {
  NativePreparedProjectSwitchResult,
  NativeProjectAuthorityDescriptor,
  SignalLoomNativeBridge,
} from './nativeApp';

export type StartupProjectRecoveryAction = 'retry' | 'open-another' | 'recover-backup' | 'continue-blank';

export type StartupProjectRecoveryActionResult =
  | { status: 'dismissed' }
  | { status: 'prepared'; result: NativePreparedProjectSwitchResult };

type StartupRecoveryBridge = Pick<
  SignalLoomNativeBridge,
  'dismissStartupProjectRecovery' | 'openProjectFile' | 'recoverStartupProjectBackup' | 'retryStartupProject'
>;

/**
 * Keeps the four recovery choices explicit and independently testable. Project-producing choices
 * only prepare a native switch; App still applies its Paper/Image replacement guard before commit.
 */
export async function requestStartupProjectRecoveryAction(options: {
  action: StartupProjectRecoveryAction;
  bridge: StartupRecoveryBridge;
  claim?: NativeProjectAuthorityDescriptor;
  backupPath?: string;
}): Promise<StartupProjectRecoveryActionResult> {
  const { action, bridge, claim, backupPath } = options;
  if (action === 'continue-blank') {
    if (!bridge.dismissStartupProjectRecovery) {
      throw new Error('This desktop build cannot dismiss startup recovery.');
    }
    const result = await bridge.dismissStartupProjectRecovery();
    if (!result.ok) throw new Error('Sloom Studio could not continue with the blank project.');
    return { status: 'dismissed' };
  }

  if (action === 'retry') {
    if (!bridge.retryStartupProject) throw new Error('This desktop build cannot retry the remembered project.');
    return { status: 'prepared', result: await bridge.retryStartupProject({ claim }) };
  }

  if (action === 'recover-backup') {
    if (!backupPath) throw new Error('Choose a project backup to recover.');
    if (!bridge.recoverStartupProjectBackup) throw new Error('This desktop build cannot recover project backups.');
    return {
      status: 'prepared',
      result: await bridge.recoverStartupProjectBackup({ filePath: backupPath, claim }),
    };
  }

  return { status: 'prepared', result: await bridge.openProjectFile({ claim }) };
}
