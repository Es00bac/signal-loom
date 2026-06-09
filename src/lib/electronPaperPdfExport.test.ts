import { describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';

interface ElectronPaperPdfExportModule {
  buildPaperPdfDefaultPath: (
    request: { fileName?: string; title?: string } | undefined,
    currentProjectPath?: string,
  ) => string;
  buildPaperPdfRenderReadyScript: (options?: {
    fontTimeoutMs?: number;
    frameTimeoutMs?: number;
    imageTimeoutMs?: number;
  }) => string;
  buildPaperPdfPrintOptions: (request?: {
    page?: { widthMm?: number; heightMm?: number };
  }) => Record<string, unknown>;
  ensurePdfExtension: (filePath: string) => string;
  sanitizePdfFileName: (value: string | undefined) => string;
}

async function loadPaperPdfExportModule(): Promise<ElectronPaperPdfExportModule> {
  // @ts-expect-error CommonJS Electron helper lives outside the renderer tsconfig module graph.
  return await import('../../electron/paper-pdf-export.cjs') as ElectronPaperPdfExportModule;
}

describe('Electron Paper PDF export helpers', () => {
  it('builds project-relative default PDF save paths with sanitized names', async () => {
    const { buildPaperPdfDefaultPath } = await loadPaperPdfExportModule();

    expect(buildPaperPdfDefaultPath(
      { fileName: 'Issue-01-Final.pdf', title: 'Ignored' },
      '/mnt/xtra/books/signal-loom-story.sloom',
    )).toBe('/mnt/xtra/books/Issue-01-Final.pdf');

    expect(buildPaperPdfDefaultPath(
      { title: 'Comic/Final: Cover?' },
      undefined,
    )).toBe('Comic-Final-Cover.pdf');
  });

  it('normalizes PDF extensions and print options for print-quality output', async () => {
    const {
      buildPaperPdfPrintOptions,
      ensurePdfExtension,
      sanitizePdfFileName,
    } = await loadPaperPdfExportModule();

    expect(ensurePdfExtension('/tmp/layout')).toBe('/tmp/layout.pdf');
    expect(ensurePdfExtension('/tmp/layout.PDF')).toBe('/tmp/layout.PDF');
    expect(sanitizePdfFileName('  My/Layout: Final?  ')).toBe('My-Layout-Final.pdf');
    expect(buildPaperPdfPrintOptions({
      page: {
        widthMm: 100,
        heightMm: 150,
      },
    })).toEqual({
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      margins: { marginType: 'custom', top: 0, bottom: 0, left: 0, right: 0 },
      pageSize: {
        width: 3.937,
        height: 5.906,
      },
      scale: 1,
    });
  });

  it('builds a bounded render-ready script that resolves when hidden windows throttle animation frames', async () => {
    const { buildPaperPdfRenderReadyScript } = await loadPaperPdfExportModule();
    const script = buildPaperPdfRenderReadyScript({
      fontTimeoutMs: 1,
      frameTimeoutMs: 1,
      imageTimeoutMs: 1,
    });

    const result = await runInNewContext(script, {
      Array,
      document: {
        fonts: { ready: new Promise(() => undefined) },
        images: [],
      },
      Promise,
      requestAnimationFrame: () => undefined,
      setTimeout,
    });

    expect(result).toBe(true);
    expect(script).toContain('Promise.race');
    expect(script).toContain('requestAnimationFrame');
  });
});
