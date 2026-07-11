import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PaperSoftProofModal } from './PaperSoftProofModal';
import { createDefaultPaperDocument } from '../../../lib/paperDocument';

// The async preview build (canvas + lcms) never runs under renderToStaticMarkup (effects don't fire on
// the server), so this exercises the modal's structure + initial loading state without needing a DOM
// canvas. The soft-proof transform itself is covered by paperSoftProof.test.ts / paperSoftProofImage.test.ts.
describe('PaperSoftProofModal', () => {
  it('renders an accessible dialog with the loading state and paper-color toggle', () => {
    const doc = createDefaultPaperDocument({ title: 'Proof me', preset: 'us-letter' });
    const html = renderToStaticMarkup(
      <PaperSoftProofModal document={doc} onClose={vi.fn()} pageId={doc.pages[0].id} />,
    );

    expect(html).toContain('data-paper-soft-proof-modal="true"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="CMYK soft proof"');
    expect(html).toContain('Building soft-proof preview'); // initial async state
    expect(html).toContain('Simulate paper color');
    expect(html).toContain('aria-label="Close soft proof"');
  });
});
