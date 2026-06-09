const { dirname, join } = require('node:path');

function sanitizePdfFileName(value) {
  const baseName = (value ?? '')
    .trim()
    .replace(/[/\\?%*:|"<>]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '') || 'paper-document';

  return /\.pdf$/i.test(baseName) ? baseName : `${baseName}.pdf`;
}

function ensurePdfExtension(filePath) {
  return /\.pdf$/i.test(filePath) ? filePath : `${filePath}.pdf`;
}

function buildPaperPdfDefaultPath(request, currentProjectPath) {
  const fileName = sanitizePdfFileName(request?.fileName || request?.title || 'paper-document');
  return currentProjectPath ? join(dirname(currentProjectPath), fileName) : fileName;
}

function buildPaperPdfPrintOptions(request) {
  const pageSize = buildPaperPdfPageSize(request);
  return {
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: false,
    scale: 1,
    ...(pageSize ? { pageSize } : {}),
    margins: { marginType: 'custom', top: 0, bottom: 0, left: 0, right: 0 },
  };
}

function buildPaperPdfRenderReadyScript(options = {}) {
  const fontTimeoutMs = sanitizePositiveInteger(options.fontTimeoutMs, 8000);
  const imageTimeoutMs = sanitizePositiveInteger(options.imageTimeoutMs, 8000);
  const frameTimeoutMs = sanitizePositiveInteger(options.frameTimeoutMs, 350);

  return `
    (async () => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const waitBounded = (promise, timeoutMs) => Promise.race([
        Promise.resolve(promise).catch(() => undefined),
        sleep(timeoutMs),
      ]);

      if (document.fonts?.ready) {
        await waitBounded(document.fonts.ready, ${fontTimeoutMs});
      }

      await Promise.all(Array.from(document.images).map((image) => {
        if (image.complete) return undefined;
        return waitBounded(new Promise((resolve) => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', resolve, { once: true });
        }), ${imageTimeoutMs});
      }));

      await Promise.race([
        new Promise((resolve) => {
          if (typeof requestAnimationFrame !== 'function') {
            resolve(true);
            return;
          }
          let frameCount = 0;
          const step = () => {
            frameCount += 1;
            if (frameCount >= 2) {
              resolve(true);
              return;
            }
            requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }),
        sleep(${frameTimeoutMs}),
      ]);

      return true;
    })()
  `;
}

function buildPaperPdfPageSize(request) {
  const widthMm = Number(request?.page?.widthMm);
  const heightMm = Number(request?.page?.heightMm);
  if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm <= 0 || heightMm <= 0) {
    return undefined;
  }
  return {
    width: Number((widthMm / 25.4).toFixed(3)),
    height: Number((heightMm / 25.4).toFixed(3)),
  };
}

function sanitizePositiveInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.round(numeric);
}

module.exports = {
  buildPaperPdfDefaultPath,
  buildPaperPdfPageSize,
  buildPaperPdfPrintOptions,
  buildPaperPdfRenderReadyScript,
  ensurePdfExtension,
  sanitizePdfFileName,
};
