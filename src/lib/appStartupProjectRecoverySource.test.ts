import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('App startup project recovery wiring', () => {
  it('offers recovery only after blank startup adoption and commits prepared choices through the shared guard', () => {
    const source = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8');

    expect(source).toMatch(/state\.startupProjectRecovery[\s\S]*setStartupProjectRecovery\(state\.startupProjectRecovery\)/);
    expect(source).toMatch(/requestStartupProjectRecoveryAction\([\s\S]*applyPreparedNativeProjectOpen\(prepared/);
    expect(source).toMatch(/requestProjectReplacementAuthorization\([\s\S]*prepareProjectDocumentTransaction\(result\.document[\s\S]*commitProjectSwitch/);
    expect(source).toContain('<StartupProjectRecoveryDialog');
    expect(source).toMatch(/onStateChanged: \(state\)[\s\S]*state\.filePath[\s\S]*setStartupProjectRecovery\(undefined\)/);
  });
});
