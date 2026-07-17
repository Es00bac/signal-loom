import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('App Source Library native sync source guards', () => {
  it('repairs native Source Library version gaps from an authoritative snapshot', () => {
    const source = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8');

    expect(source).toContain('shouldRepairSourceLibraryNativeVersionGap');
    expect(source).toContain('expectedNativeVersion: nativeVersion');
    expect(source).toContain('result.version < nativeVersion');
    expect(source).toContain('sourceLibraryNativeSyncStatus.lastAckVersion');
    expect(source).toContain("sourceLibraryNativeSyncStatus.repairDirection === 'pull-native-snapshot'");
    expect(source).toMatch(/sourceLibraryNativeVersionRef\.current = ackVersion/);
    expect(source).toMatch(/bridge\.getSourceLibrarySnapshot\(\{ claim: repairScope\.claim \}\)[\s\S]*type: 'source-library-snapshot'/);
    expect(source).toContain('isCurrentProjectAuthorityMutationScope(repairScope)');
    expect(source).toMatch(/sourceLibraryNativeVersionRef\.current = result\.version[\s\S]*applySourceLibraryNativeChange/);
    expect(source).toContain('Source Library repaired from a native snapshot.');
  });

  it('exposes an automation-only Source hook that requires exact authority and renders only after native commit', () => {
    const source = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8');

    expect(source).toContain('signalLoomAutomation');
    expect(source).toContain('SIGNAL_LOOM_ENABLE_AUTOMATION_PATHS');
    expect(source).toContain("return { error: 'exact project authority missing or stale' }");
    expect(source).toMatch(/await bridge\.applySourceLibraryChange\([\s\S]*isCurrentProjectAuthorityMutationScope\(scope\)[\s\S]*applySourceLibraryChangeToRenderer\(request\.change, result\.version/);
    expect(source).toContain("return { error: 'native bridge missing' }");
  });
});
