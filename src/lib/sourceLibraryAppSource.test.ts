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
    expect(source).toMatch(/bridge\.getSourceLibrarySnapshot\(\)[\s\S]*type: 'source-library-snapshot'/);
    expect(source).toMatch(/sourceLibraryNativeVersionRef\.current = result\.version[\s\S]*applySourceLibraryNativeChange/);
    expect(source).toContain('Source Library repaired from a native snapshot.');
  });

  it('exposes an automation-only Source Library change hook that updates the renderer before native sync', () => {
    const source = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8');

    expect(source).toContain('signalLoomAutomation');
    expect(source).toContain('SIGNAL_LOOM_ENABLE_AUTOMATION_PATHS');
    expect(source).toMatch(/applySourceLibraryChangeToRenderer\(change, undefined, \{ repairVersionGaps: false \}\)/);
    expect(source).toContain("return { error: 'native bridge missing' }");
  });
});
