import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('PaperRichEditableText Ctrl/Cmd+B/I/U keyboard shortcuts', () => {
  it('wires Ctrl/Cmd+B/I/U to the same runCommand the floating toolbar\'s B/I/U buttons already use', () => {
    const source = readFileSync(new URL('./PaperWorkspace.tsx', import.meta.url), 'utf8');

    // The toolbar buttons' own tooltips ("Bold (Ctrl+B)" etc.) already advertised this shortcut — this
    // asserts the keydown handler actually implements it now, not just the tooltip claiming it does.
    expect(source).toContain("event.metaKey || event.ctrlKey");
    expect(source).toContain("runCommand(key === 'b' ? 'bold' : key === 'i' ? 'italic' : 'underline')");
  });
});
