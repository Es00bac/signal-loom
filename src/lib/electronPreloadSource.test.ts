import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Electron preload source guards', () => {
  it('exposes the automation enable flag without exposing automation file paths', () => {
    const source = readFileSync(join(process.cwd(), 'electron/preload.cjs'), 'utf8');

    expect(source).toContain("contextBridge.exposeInMainWorld(\n  'SIGNAL_LOOM_ENABLE_AUTOMATION_PATHS'");
    expect(source).toContain("process.env.SIGNAL_LOOM_ENABLE_AUTOMATION_PATHS === '1' ? '1' : '0'");
    expect(source).not.toContain('SIGNAL_LOOM_AUTOMATION_PROJECT_OPEN_PATH');
    expect(source).not.toContain('SIGNAL_LOOM_AUTOMATION_PROJECT_SAVE_PATH');
    expect(source).not.toContain('SIGNAL_LOOM_AUTOMATION_PAPER_PDF_PATH');
    expect(source).not.toContain('SIGNAL_LOOM_AUTOMATION_PAPER_IMAGE_DIRECTORY');
  });
});
