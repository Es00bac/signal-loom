import { describe, expect, it } from 'vitest';

async function loadVersionDisplay(): Promise<{
  formatInternalBuildVersion: (version: unknown) => string;
}> {
  return await import('../../electron/version-display.cjs') as {
    formatInternalBuildVersion: (version: unknown) => string;
  };
}

describe('Electron internal build version display', () => {
  it('presents the SemVer-safe single-letter suffix in the compact release notation', async () => {
    const { formatInternalBuildVersion } = await loadVersionDisplay();

    expect(formatInternalBuildVersion('0.9.12-d')).toBe('0.9.12d');
  });

  it('does not rewrite public or named prerelease versions', async () => {
    const { formatInternalBuildVersion } = await loadVersionDisplay();

    expect(formatInternalBuildVersion('0.9.12')).toBe('0.9.12');
    expect(formatInternalBuildVersion('0.9.12-beta')).toBe('0.9.12-beta');
    expect(formatInternalBuildVersion(undefined)).toBe('');
  });
});
