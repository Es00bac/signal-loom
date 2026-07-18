import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ORACLE_SCRIPT = resolve(import.meta.dirname, '../../scripts/paperManagedFontDescriptor_chromium_oracle.py');

function hasChromiumOracle(): boolean {
  try {
    execSync('python3.11 -c "import playwright"', { stdio: 'ignore' });
    execSync('command -v npx', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

interface OracleResult {
  descriptors: Array<{ value: string; accepted: boolean; error?: string }>;
  oldPercentageAccepted: boolean;
}

const describeOrSkip = hasChromiumOracle() ? describe : describe.skip;

describeOrSkip('Paper managed-font descriptor Chromium oracle', () => {
  it('accepts every exact stretch keyword and rejects the old percentage shorthand', () => {
    const stdout = execSync(`python3.11 "${ORACLE_SCRIPT}"`, {
      encoding: 'utf8',
      timeout: 120_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const result = JSON.parse(stdout.trim().split(/\r?\n/).at(-1) ?? '{}') as OracleResult;
    expect(result.descriptors).toHaveLength(9);
    expect(result.descriptors.filter((entry) => !entry.accepted)).toEqual([]);
    expect(result.oldPercentageAccepted).toBe(false);
  }, 30_000);
});
