// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PAPER_TYPOGRAPHY } from '../../../lib/paperDocument';
import { getSignalLoomNativeBridge } from '../../../lib/nativeApp';
import { PaperBundledFontPicker } from './PaperBundledFontPicker';

const mocks = vi.hoisted(() => ({
  addImportedFont: vi.fn(),
  installBundledPaperFontFace: vi.fn(),
  family: {
    id: 'base:paper-authority',
    family: 'Paper Authority Sans',
    slug: 'paper-authority',
    collection: 'base',
    role: 'sans',
    sourceUrl: 'https://example.test',
    sourceVersion: '1',
    licenseId: 'OFL-1.1',
    licenseFile: 'LICENSE',
    licenseSha256: 'a'.repeat(64),
    licenseByteLength: 1,
    warnings: [],
    faces: [],
  },
  face: {
    id: 'paper-authority:regular',
    file: 'collection/base/paper-authority/Regular.ttf',
    collectionIndex: 0,
    sha256: 'b'.repeat(64),
    byteLength: 1,
    family: 'Paper Authority Sans',
    subfamily: 'Regular',
    fullName: 'Paper Authority Sans Regular',
    postscriptName: 'PaperAuthoritySans-Regular',
    version: '1',
    weight: 400,
    style: 'normal',
    stretchPercent: 100,
    glyphCount: 1,
    variable: false,
    axes: {},
    canSubset: true,
    hasVerticalSubstitution: false,
  },
}));

vi.mock('../../../components/Common/BundledFontBrowser', async () => {
  const { createElement } = await import('react');
  const { getSignalLoomNativeBridge: currentBridge } = await import('../../../lib/nativeApp');
  return {
    BundledFontBrowser: ({ onSelect }: { onSelect: (family: typeof mocks.family, face: typeof mocks.face, authority: { isCurrent: () => boolean }) => void | Promise<void> }) => createElement(
      'button',
      {
        onClick: () => {
          const bridge = currentBridge();
          void onSelect(mocks.family, mocks.face, { isCurrent: () => currentBridge() === bridge });
        },
        type: 'button',
      },
      'Select bundled Paper face',
    ),
  };
});

vi.mock('../../../lib/bundledFontLibrary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/bundledFontLibrary')>();
  return { ...actual, installBundledPaperFontFace: mocks.installBundledPaperFontFace };
});

vi.mock('../../../store/paperStore', () => ({
  usePaperStore: (selector: (state: { addImportedFont: typeof mocks.addImportedFont }) => unknown) => selector({ addImportedFont: mocks.addImportedFont }),
}));

vi.mock('../assets/PaperAssetRuntime', () => ({ paperAssetRepository: {} }));

function bridge() {
  return {
    getNativeState: vi.fn(),
    onMenuCommand: vi.fn(),
    bundledFontLibraryStatus: vi.fn(async () => ({ available: true })),
  };
}

afterEach(() => {
  delete window.signalLoomNative;
  mocks.addImportedFont.mockReset();
  mocks.installBundledPaperFontFace.mockReset();
});

describe('PaperBundledFontPicker selection authority (FBL-025)', () => {
  it('does not mutate Paper typography or document state after its installation await loses bridge authority', async () => {
    const aBridge = bridge();
    window.signalLoomNative = aBridge as never;
    let resolveInstall: ((value: unknown) => void) | undefined;
    mocks.installBundledPaperFontFace.mockImplementation(() => new Promise((resolve) => { resolveInstall = resolve; }));
    const onChange = vi.fn();
    const host = document.createElement('div');
    const root = createRoot(host);

    await act(async () => root.render(<PaperBundledFontPicker onChange={onChange} typography={DEFAULT_PAPER_TYPOGRAPHY} />));
    await act(async () => host.querySelector('button')?.click());
    await act(async () => {
      await vi.waitFor(() => expect(mocks.installBundledPaperFontFace).toHaveBeenCalledTimes(1));
    });

    // This is a replacement of the live bridge identity, not an unmount of the Paper picker.
    window.signalLoomNative = bridge() as never;
    await act(async () => root.render(<PaperBundledFontPicker onChange={onChange} typography={DEFAULT_PAPER_TYPOGRAPHY} />));
    expect(getSignalLoomNativeBridge()).not.toBe(aBridge);
    await act(async () => resolveInstall?.({ id: 'installed-a-face' }));

    expect(mocks.addImportedFont).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain('pinned to this document');
    await act(async () => root.unmount());
  });

  it('publishes a current Paper selection after installation completes', async () => {
    window.signalLoomNative = bridge() as never;
    mocks.installBundledPaperFontFace.mockResolvedValue({ id: 'installed-current-face' });
    const onChange = vi.fn();
    const host = document.createElement('div');
    const root = createRoot(host);

    await act(async () => root.render(<PaperBundledFontPicker onChange={onChange} typography={DEFAULT_PAPER_TYPOGRAPHY} />));
    await act(async () => host.querySelector('button')?.click());
    await act(async () => {
      await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
        fontFamily: 'Paper Authority Sans',
        fontWeight: '400',
      })));
    });

    expect(mocks.addImportedFont).toHaveBeenCalledWith({ id: 'installed-current-face' });
    expect(host.textContent).toContain('Paper Authority Sans Regular pinned to this document');
    await act(async () => root.unmount());
  });
});
