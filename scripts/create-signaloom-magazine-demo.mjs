#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { strToU8, zipSync } from 'fflate';

const FORMAT = 'signal-loom-paper';
const FORMAT_VERSION = 2;
const MIDPOINT_MM = 148.5;
const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const SAFE_SANS = 'Arial, "Liberation Sans", "Helvetica Neue", Helvetica, "Noto Sans", "DejaVu Sans", sans-serif';
const JP_SANS = '"Noto Sans CJK JP", "Noto Sans JP", "Yu Gothic", "Hiragino Kaku Gothic ProN", sans-serif';
const DISPLAY = '"Arial Narrow", "Liberation Sans Narrow", Arial, sans-serif';
const MONO = '"IBM Plex Mono", "Liberation Mono", "Noto Sans Mono", monospace';

const COLORS = {
  paper: '#f3f0e8',
  ink: '#111318',
  cobalt: '#1239b8',
  cyan: '#16d9de',
  coral: '#ff5d54',
  blueBlack: '#071426',
  white: '#ffffff',
  muted: '#6d7078',
};

const DEFAULT_TYPOGRAPHY = {
  fontFamily: SAFE_SANS,
  fontSizePt: 10,
  leadingPt: 13,
  tracking: 0,
  align: 'left',
  hyphenate: true,
  color: COLORS.ink,
  fontWeight: '400',
  fontStyle: 'normal',
  firstLineIndentMm: 0,
  alignLast: 'auto',
  smallCaps: false,
  numericStyle: 'normal',
  dropCapLines: 0,
  spaceBeforeMm: 0,
  spaceAfterMm: 0,
  lineBreak: 'auto',
  writingMode: 'horizontal-tb',
  textOrientation: 'mixed',
  lineBreakStrict: false,
  emphasis: 'none',
};

function flattenRichText(richText) {
  return richText.map((paragraph) => paragraph.runs.map((run) => run.text).join('')).join('\n');
}

function frame(id, kind, xMm, yMm, widthMm, heightMm, options = {}) {
  const resolvedKind = kind === 'shape' && !options.shapeKind ? 'panel' : kind;
  const richText = options.richText;
  const image = kind === 'image';
  const shape = kind === 'shape' || kind === 'panel';
  const text = richText ? flattenRichText(richText) : (options.text ?? '');
  return {
    id,
    kind: resolvedKind,
    label: options.label ?? id,
    xMm,
    yMm,
    widthMm,
    heightMm,
    rotationDeg: options.rotationDeg ?? 0,
    locked: options.locked ?? false,
    text,
    ...(richText ? { richText } : {}),
    ...(options.asset ? { asset: options.asset } : {}),
    fit: options.fit ?? (image ? 'cover' : 'contain'),
    imageScale: options.imageScale ?? 1,
    imageOffsetXPercent: options.imageOffsetXPercent ?? 0,
    imageOffsetYPercent: options.imageOffsetYPercent ?? 0,
    imageRotationDeg: options.imageRotationDeg ?? 0,
    imageFlipX: false,
    imageFlipY: false,
    columns: options.columns ?? 1,
    ...(options.columnGutterMm !== undefined ? { columnGutterMm: options.columnGutterMm } : {}),
    ...(options.columnRule !== undefined ? { columnRule: options.columnRule } : {}),
    ...(options.columnBalance !== undefined ? { columnBalance: options.columnBalance } : {}),
    ...(options.threadId ? { threadId: options.threadId, threadOrder: options.threadOrder } : {}),
    typography: { ...DEFAULT_TYPOGRAPHY, ...options.typography },
    fillColor: options.fillColor ?? (image ? COLORS.blueBlack : shape ? COLORS.paper : 'transparent'),
    ...(options.fillSwatchId ? { fillSwatchId: options.fillSwatchId } : {}),
    ...(options.fillTintPercent !== undefined ? { fillTintPercent: options.fillTintPercent } : {}),
    fillOpacity: options.fillOpacity ?? (kind === 'text' ? 0 : 1),
    ...(options.fillGradient ? { fillGradient: options.fillGradient } : {}),
    strokeColor: options.strokeColor ?? 'transparent',
    strokeOpacity: options.strokeOpacity ?? 1,
    strokeWidthMm: options.strokeWidthMm ?? 0,
    strokeStyle: options.strokeStyle ?? 'solid',
    cornerRadiusMm: options.cornerRadiusMm ?? 0,
    opacity: options.opacity ?? 1,
    ...(options.shapeKind ? { shapeKind: options.shapeKind } : {}),
    textBoxXPercent: options.textBoxXPercent ?? 0,
    textBoxYPercent: options.textBoxYPercent ?? 0,
    textBoxWidthPercent: options.textBoxWidthPercent ?? 100,
    textBoxHeightPercent: options.textBoxHeightPercent ?? 100,
    textRotationDeg: options.textRotationDeg ?? 0,
    textVerticalAlign: options.textVerticalAlign ?? 'top',
    zIndex: options.zIndex ?? 1,
    ...(options.paragraphStyleId ? { paragraphStyleId: options.paragraphStyleId } : {}),
    ...(options.characterStyleId ? { characterStyleId: options.characterStyleId } : {}),
    ...(options.objectStyleId ? { objectStyleId: options.objectStyleId } : {}),
    inherited: false,
  };
}

function managedImageAsset(record, label, pixelWidth, pixelHeight) {
  return {
    label,
    kind: 'image',
    locator: { kind: 'managed', ref: record.ref },
    mimeType: record.ref.mimeType,
    pixelWidth,
    pixelHeight,
    embeddedAt: 1_784_132_800_000,
  };
}

function pageGuides(extra = []) {
  return [
    { id: 'guide-v-left', orientation: 'vertical', positionMm: 14, label: 'Live left' },
    { id: 'guide-v-center', orientation: 'vertical', positionMm: 105, label: 'Spread module' },
    { id: 'guide-v-right', orientation: 'vertical', positionMm: 196, label: 'Live right' },
    { id: 'guide-h-top', orientation: 'horizontal', positionMm: 14, label: 'Live top' },
    { id: 'guide-h-half', orientation: 'horizontal', positionMm: MIDPOINT_MM, label: 'Article / ad boundary' },
    { id: 'guide-h-bottom', orientation: 'horizontal', positionMm: 283, label: 'Live bottom' },
    ...extra,
  ];
}

function swatches() {
  return [
    { id: 'sw-paper', name: 'Warm Paper', type: 'process', model: 'cmyk', rgb: { r: 243, g: 240, b: 232 }, cmyk: { c: 3, m: 3, y: 7, k: 0 } },
    { id: 'sw-ink', name: 'Editorial Ink', type: 'process', model: 'cmyk', rgb: { r: 17, g: 19, b: 24 }, cmyk: { c: 29, m: 21, y: 0, k: 91 } },
    { id: 'sw-cobalt', name: 'Signal Cobalt', type: 'process', model: 'cmyk', rgb: { r: 18, g: 57, b: 184 }, cmyk: { c: 90, m: 69, y: 0, k: 0 } },
    { id: 'sw-cyan', name: 'Electric Cyan', type: 'process', model: 'cmyk', rgb: { r: 22, g: 217, b: 222 }, cmyk: { c: 76, m: 0, y: 21, k: 0 } },
    { id: 'sw-coral', name: 'Warm Signal', type: 'spot', model: 'cmyk', rgb: { r: 255, g: 93, b: 84 }, cmyk: { c: 0, m: 72, y: 62, k: 0 }, spotName: 'Sloom Signal Coral' },
    { id: 'sw-blue-black', name: 'Blue Black', type: 'process', model: 'cmyk', rgb: { r: 7, g: 20, b: 38 }, cmyk: { c: 82, m: 47, y: 0, k: 85 } },
  ];
}

function styles(japanese) {
  const bodyFont = japanese ? JP_SANS : SAFE_SANS;
  return {
    paragraph: [
      { id: 'p-display', name: 'Feature Display', typography: { fontFamily: japanese ? JP_SANS : DISPLAY, fontSizePt: japanese ? 35 : 42, leadingPt: japanese ? 40 : 42, tracking: japanese ? 20 : -25, fontWeight: '800', hyphenate: false, lineBreak: 'balance' } },
      { id: 'p-deck', name: 'Feature Deck', typography: { fontFamily: bodyFont, fontSizePt: 13, leadingPt: 17, tracking: 5, fontWeight: '500', hyphenate: false, lineBreak: 'pretty' } },
      { id: 'p-body', name: 'Feature Body', typography: { fontFamily: bodyFont, fontSizePt: japanese ? 8.8 : 9.1, leadingPt: japanese ? 13.2 : 12.2, align: japanese ? 'left' : 'justify', alignLast: 'left', hyphenate: !japanese, lineBreak: 'pretty', lineBreakStrict: japanese } },
      { id: 'p-body-drop', name: 'Feature Opening Drop Cap', basedOnId: 'p-body', typography: { dropCapLines: 3, spaceAfterMm: 1.4 } },
      { id: 'p-running', name: 'Running Head', typography: { fontFamily: MONO, fontSizePt: 7.2, leadingPt: 9, tracking: 120, fontWeight: '700', smallCaps: true, hyphenate: false } },
      { id: 'p-caption', name: 'Image Caption', typography: { fontFamily: bodyFont, fontSizePt: 7.2, leadingPt: 9.2, tracking: 15, fontWeight: '500', hyphenate: false } },
      { id: 'p-pull', name: 'Pull Quote', typography: { fontFamily: japanese ? JP_SANS : DISPLAY, fontSizePt: japanese ? 15 : 17, leadingPt: japanese ? 23 : 19, tracking: 0, fontWeight: '700', hyphenate: false, lineBreak: 'balance', lineBreakStrict: japanese } },
      { id: 'p-timeline', name: 'Timeline', typography: { fontFamily: bodyFont, fontSizePt: 7.4, leadingPt: 9.4, tracking: 5, fontWeight: '500', hyphenate: false } },
      { id: 'p-ad-display', name: 'Advertisement Display', typography: { fontFamily: japanese ? JP_SANS : DISPLAY, fontSizePt: japanese ? 24 : 28, leadingPt: japanese ? 32 : 29, tracking: japanese ? 15 : -10, fontWeight: '800', hyphenate: false, lineBreak: 'balance', lineBreakStrict: japanese } },
      { id: 'p-ad-legal', name: 'Advertisement Legal', typography: { fontFamily: MONO, fontSizePt: 6.5, leadingPt: 8, tracking: 55, fontWeight: '700', hyphenate: false } },
    ],
    character: [
      { id: 'c-bold', name: 'Signal Bold', typography: { fontWeight: '800' } },
      { id: 'c-coral', name: 'Signal Coral', typography: { color: COLORS.coral, fontWeight: '800' } },
      { id: 'c-cyan', name: 'Signal Cyan', typography: { color: COLORS.cyan, fontWeight: '700' } },
      { id: 'c-inverse', name: 'Inverse', typography: { color: COLORS.white, fontWeight: '700' } },
      { id: 'c-mono', name: 'System Mono', typography: { fontFamily: MONO, tracking: 80, smallCaps: true } },
    ],
    object: [
      { id: 'o-full-bleed-image', name: 'Full Bleed Image', frame: { fillColor: COLORS.blueBlack, strokeColor: 'transparent', strokeWidthMm: 0, cornerRadiusMm: 0, opacity: 1 } },
      { id: 'o-hairline', name: 'Editorial Hairline', frame: { fillColor: COLORS.cobalt, strokeColor: 'transparent', strokeWidthMm: 0, cornerRadiusMm: 0, opacity: 1 } },
      { id: 'o-paper-card', name: 'Warm Paper Card', frame: { fillColor: COLORS.paper, fillOpacity: 0.94, strokeColor: 'transparent', strokeWidthMm: 0, cornerRadiusMm: 0, opacity: 1 } },
      { id: 'o-meta-card', name: 'Signal Metadata', frame: { fillColor: COLORS.cobalt, fillOpacity: 1, strokeColor: COLORS.cyan, strokeWidthMm: 0.25, cornerRadiusMm: 1.5, opacity: 1 } },
      { id: 'o-ad-overlay', name: 'Advertisement Overlay', frame: { fillColor: COLORS.blueBlack, fillOpacity: 0.9, strokeColor: 'transparent', strokeWidthMm: 0, cornerRadiusMm: 0, opacity: 1 } },
      { id: 'o-accent-chip', name: 'Accent Chip', frame: { fillColor: COLORS.coral, fillOpacity: 1, strokeColor: 'transparent', strokeWidthMm: 0, cornerRadiusMm: 100, opacity: 1 } },
    ],
  };
}

function baseDocument(title, japanese, now) {
  const parentId = japanese ? 'parent-jp-feature' : 'parent-en-feature';
  return {
    id: japanese ? 'paper-signaloom-japanese-magazine' : 'paper-signaloom-english-magazine',
    title,
    page: { preset: 'a4', widthMm: PAGE_WIDTH_MM, heightMm: PAGE_HEIGHT_MM, bleedMm: 3, dpi: 300 },
    layout: {
      marginsMm: { top: 14, right: 14, bottom: 14, left: 14 },
      columns: { count: 6, gutterMm: 4 },
      grid: { enabled: true, sizeMm: 4, subdivisions: 4 },
      baselineGrid: { startMm: 14, incrementMm: japanese ? 4.65 : 4.3 },
    },
    background: { type: 'solid', color: COLORS.paper, fromColor: COLORS.paper, toColor: COLORS.paper, angleDeg: 90, radialShape: 'ellipse' },
    printProduction: {
      pdfStandard: 'browser-pdf',
      outputIntentProfileId: 'srgb',
      customOutputIntentName: '',
      totalInkLimitPercent: 300,
      blackPolicy: 'warn-rich-black',
      spotColorPolicy: 'preserve-named',
      overprintPreview: true,
    },
    view: {
      showRulers: true,
      showGrid: true,
      showBaselineGrid: true,
      showGuides: true,
      showFrameEdges: false,
      showBleed: true,
      showSpreads: true,
      startOnRight: false,
      rtlBinding: japanese,
      snapToGuides: true,
      snapToGrid: true,
    },
    parentPages: [{
      id: parentId,
      name: japanese ? 'A-特集マスター' : 'A-Feature Master',
      frames: [
        frame(`${parentId}-rule`, 'shape', 14, 11, 182, 0.45, { label: 'Parent Running Rule', fillColor: COLORS.cobalt, zIndex: 0 }),
      ],
      guides: pageGuides(),
    }],
    styles: styles(japanese),
    swatches: swatches(),
    pages: [],
    createdAt: now,
    updatedAt: now,
  };
}

function englishPageOne(hero) {
  const heroAsset = managedImageAsset(hero, 'Flow · Signaloom editorial hero', 896, 1200);
  return {
    id: 'en-page-1',
    pageNumber: 1,
    parentPageId: 'parent-en-feature',
    guides: pageGuides([{ id: 'guide-h-hero', orientation: 'horizontal', positionMm: 122, label: 'Hero start' }]),
    frames: [
      frame('en-p1-top-rule', 'shape', 0, 0, 210, 4, { label: 'Feature Cobalt Rule', fillColor: COLORS.cobalt, zIndex: 10, objectStyleId: 'o-hairline' }),
      frame('en-p1-masthead', 'text', 14, 12, 100, 8, {
        label: 'Magazine Identity', text: 'SLOOM / MATERIAL SYSTEMS', paragraphStyleId: 'p-running',
        typography: { fontFamily: MONO, fontSizePt: 7.2, leadingPt: 8, tracking: 130, fontWeight: '700', smallCaps: true, color: COLORS.cobalt }, zIndex: 12,
      }),
      frame('en-p1-issue', 'text', 145, 12, 51, 8, {
        label: 'Issue Metadata', text: 'DEMO ISSUE 01  /  2026', paragraphStyleId: 'p-running',
        typography: { fontFamily: MONO, fontSizePt: 6.8, leadingPt: 8, tracking: 70, align: 'right', color: COLORS.muted, hyphenate: false }, zIndex: 12,
      }),
      frame('en-p1-headline', 'text', 14, 27, 174, 43, {
        label: 'Feature Headline', paragraphStyleId: 'p-display',
        richText: [{ runs: [
          { text: 'WOVEN', fontWeight: '800', color: COLORS.ink, tracking: -30 },
          { text: ' FROM\n', fontWeight: '300', color: COLORS.cobalt, tracking: 10 },
          { text: 'SIGNALS', fontWeight: '800', color: COLORS.ink, tracking: -30 },
        ] }],
        typography: { fontFamily: DISPLAY, fontSizePt: 42, leadingPt: 40, tracking: -20, fontWeight: '800', lineBreak: 'balance', hyphenate: false }, zIndex: 12,
      }),
      frame('en-p1-japanese-kicker', 'text', 190, 30, 10, 46, {
        label: 'Japanese Vertical Kicker', text: '信号を、かたちへ。',
        typography: { fontFamily: JP_SANS, fontSizePt: 8, leadingPt: 10, tracking: 80, fontWeight: '700', color: COLORS.coral, writingMode: 'vertical-rl', textOrientation: 'mixed', lineBreakStrict: true, hyphenate: false }, zIndex: 12,
      }),
      frame('en-p1-deck', 'text', 14, 77, 120, 34, {
        label: 'Feature Deck', paragraphStyleId: 'p-deck',
        richText: [{ runs: [
          { text: 'A node canvas became a connected creative studio—then learned how to turn generated material into ', fontWeight: '500' },
          { text: 'finished pages.', fontWeight: '800', color: COLORS.cobalt, underline: true },
        ] }],
        typography: { fontFamily: SAFE_SANS, fontSizePt: 13, leadingPt: 17, fontWeight: '500', lineBreak: 'pretty', hyphenate: false }, zIndex: 12,
      }),
      frame('en-p1-byline', 'text', 14, 111, 120, 7, {
        label: 'Byline', text: 'STORY / SLOOM STUDIO     ART / GENERATED IN FLOW', paragraphStyleId: 'p-running',
        typography: { fontFamily: MONO, fontSizePt: 6.4, leadingPt: 7.5, tracking: 45, color: COLORS.muted, fontWeight: '700', hyphenate: false }, zIndex: 12,
      }),
      frame('en-p1-meta-card', 'shape', 151, 78, 37, 31, {
        label: 'Capability Metadata Card', fillColor: COLORS.cobalt, fillGradient: { type: 'linear', fromColor: COLORS.cobalt, toColor: '#0b246f', angleDeg: 135 }, cornerRadiusMm: 1.5, strokeColor: COLORS.cyan, strokeWidthMm: 0.25, zIndex: 9, objectStyleId: 'o-meta-card',
      }),
      frame('en-p1-meta-text', 'text', 156, 83, 28, 21, {
        label: 'Capability Metadata', text: '04\nWORKSPACES\n01 SOURCE',
        typography: { fontFamily: MONO, fontSizePt: 7.5, leadingPt: 8.8, tracking: 70, fontWeight: '700', color: COLORS.white, hyphenate: false }, zIndex: 13,
      }),
      frame('en-p1-hero', 'image', 0, 122, 210, 175, {
        label: 'Hero Image · Flow Asset', asset: heroAsset, fit: 'cover', imageScale: 1.03, imageOffsetXPercent: 3, objectStyleId: 'o-full-bleed-image', zIndex: 1,
      }),
      frame('en-p1-hero-wash', 'shape', 0, 122, 112, 175, {
        label: 'Hero Editorial Gradient', fillColor: COLORS.blueBlack, fillOpacity: 0.82,
        fillGradient: { type: 'linear', fromColor: '#071426', toColor: '#07142600', angleDeg: 90 }, opacity: 0.92, zIndex: 3,
      }),
      frame('en-p1-opening-card', 'shape', 12, 183, 87, 96, {
        label: 'Opening Article Card', fillColor: COLORS.paper, fillOpacity: 0.96, cornerRadiusMm: 1.4, zIndex: 5, objectStyleId: 'o-paper-card',
      }),
      frame('en-p1-opening', 'text', 19, 192, 73, 76, {
        label: 'Article Opening', paragraphStyleId: 'p-body-drop', threadId: 'signaloom-feature', threadOrder: 0,
        richText: [
          { dropCapLines: 3, spaceAfterMm: 1.4, runs: [
            { text: 'S', fontWeight: '800', color: COLORS.cobalt },
            { text: 'ignaloom began with a simple proposition: creative AI should feel less like a prompt box and more like a studio table.' },
          ] },
          { runs: [{ text: 'The first Flow canvas made that idea visible. Models became nodes, prompts became material, and every connection exposed the path from intention to output.' }] },
        ],
        typography: { fontFamily: SAFE_SANS, fontSizePt: 9.1, leadingPt: 12.2, align: 'justify', alignLast: 'left', hyphenate: true, lineBreak: 'pretty' }, zIndex: 7,
      }),
      frame('en-p1-pull-rule', 'shape', 111, 161, 4, 52, { label: 'Pull Quote Coral Rule', fillColor: COLORS.coral, cornerRadiusMm: 2, zIndex: 6, objectStyleId: 'o-accent-chip' }),
      frame('en-p1-pull', 'text', 121, 160, 72, 54, {
        label: 'Pull Quote', text: '“The graph was never the destination. It was the loom.”', paragraphStyleId: 'p-pull',
        typography: { fontFamily: DISPLAY, fontSizePt: 17, leadingPt: 19, tracking: 0, fontWeight: '700', color: COLORS.white, lineBreak: 'balance', hyphenate: false }, zIndex: 7,
      }),
      frame('en-p1-bridge', 'text', 121, 222, 72, 32, {
        label: 'Article Opening Bridge', paragraphStyleId: 'p-body', threadId: 'signaloom-feature', threadOrder: 1,
        text: 'But a graph could not finish the work. Images still needed touch, sequences needed time, and ideas needed a page with consequence.',
        typography: { fontFamily: SAFE_SANS, fontSizePt: 7.8, leadingPt: 10.2, fontWeight: '500', color: COLORS.white, hyphenate: false, lineBreak: 'pretty' }, zIndex: 7,
      }),
      frame('en-p1-caption', 'text', 109, 266, 86, 15, {
        label: 'Hero Caption', text: 'FLOW AS MATERIAL — signal traces become a physical textile in the generated opening image.', paragraphStyleId: 'p-caption',
        typography: { fontFamily: SAFE_SANS, fontSizePt: 7.1, leadingPt: 9, tracking: 20, fontWeight: '600', color: COLORS.white, hyphenate: false }, zIndex: 7,
      }),
      frame('en-p1-folio', 'text', 190, 284, 8, 7, {
        label: 'Page Folio', text: '01', typography: { fontFamily: MONO, fontSizePt: 7, leadingPt: 8, align: 'right', fontWeight: '700', color: COLORS.white, hyphenate: false }, zIndex: 8,
      }),
    ],
  };
}

function englishPageTwo(ad) {
  const adAsset = managedImageAsset(ad, 'Flow · Sloan Studio T-shirt ad composite', 1232, 832);
  return {
    id: 'en-page-2',
    pageNumber: 2,
    parentPageId: 'parent-en-feature',
    guides: pageGuides([{ id: 'guide-h-timeline', orientation: 'horizontal', positionMm: 58, label: 'Timeline baseline' }]),
    frames: [
      frame('en-p2-top-rule', 'shape', 0, 0, 210, 4, { label: 'Article Cobalt Rule', fillColor: COLORS.cobalt, zIndex: 10 }),
      frame('en-p2-running', 'text', 14, 12, 182, 7, {
        label: 'Article Running Head', text: 'WOVEN FROM SIGNALS   /   THE MAKING OF A CONNECTED CREATIVE STUDIO', paragraphStyleId: 'p-running',
        typography: { fontFamily: MONO, fontSizePt: 6.7, leadingPt: 8, tracking: 75, fontWeight: '700', color: COLORS.cobalt, hyphenate: false }, zIndex: 12,
      }),
      frame('en-p2-timeline-label', 'text', 14, 24, 30, 7, {
        label: 'Timeline Label', text: 'THREE TURNS', paragraphStyleId: 'p-running',
        typography: { fontFamily: MONO, fontSizePt: 6.5, leadingPt: 8, tracking: 100, fontWeight: '700', color: COLORS.coral, hyphenate: false }, zIndex: 12,
      }),
      frame('en-p2-timeline-01', 'shape', 14, 34, 56, 23, { label: 'Timeline 01 Card', fillColor: '#e4e8f4', strokeColor: COLORS.cobalt, strokeWidthMm: 0.25, cornerRadiusMm: 1, zIndex: 2 }),
      frame('en-p2-timeline-01-text', 'text', 19, 38, 46, 15, {
        label: 'Timeline 01', richText: [{ runs: [{ text: '01  FLOW\n', fontWeight: '800', color: COLORS.cobalt }, { text: 'Prompts become a visible, repeatable graph.' }] }],
        typography: { fontFamily: SAFE_SANS, fontSizePt: 7.3, leadingPt: 9.2, fontWeight: '500', hyphenate: false }, zIndex: 4,
      }),
      frame('en-p2-timeline-02', 'shape', 76, 34, 56, 23, { label: 'Timeline 02 Card', fillColor: '#d8f5f2', strokeColor: COLORS.cyan, strokeWidthMm: 0.25, cornerRadiusMm: 1, zIndex: 2 }),
      frame('en-p2-timeline-02-text', 'text', 81, 38, 46, 15, {
        label: 'Timeline 02', richText: [{ runs: [{ text: '02  STUDIO\n', fontWeight: '800', color: COLORS.cobalt }, { text: 'Image, Video and one source library join the canvas.' }] }],
        typography: { fontFamily: SAFE_SANS, fontSizePt: 7.3, leadingPt: 9.2, fontWeight: '500', hyphenate: false }, zIndex: 4,
      }),
      frame('en-p2-timeline-03', 'shape', 138, 34, 58, 23, { label: 'Timeline 03 Card', fillColor: '#fbe3dc', strokeColor: COLORS.coral, strokeWidthMm: 0.25, cornerRadiusMm: 1, zIndex: 2 }),
      frame('en-p2-timeline-03-text', 'text', 143, 38, 48, 15, {
        label: 'Timeline 03', richText: [{ runs: [{ text: '03  PAPER\n', fontWeight: '800', color: COLORS.coral }, { text: 'Generated material becomes an intentional publication.' }] }],
        typography: { fontFamily: SAFE_SANS, fontSizePt: 7.3, leadingPt: 9.2, fontWeight: '500', hyphenate: false }, zIndex: 4,
      }),
      frame('en-p2-article-columns', 'text', 14, 67, 119, 71, {
        label: 'Article Continuation Columns', paragraphStyleId: 'p-body', threadId: 'signaloom-feature', threadOrder: 2,
        columns: 2, columnGutterMm: 6, columnRule: true, columnBalance: true,
        richText: [
          { runs: [{ text: 'Then the limits of the graph appeared. An image needed retouching. A sequence needed timing. A finished idea needed margins, hierarchy and type. That pressure expanded Signaloom into connected Flow, Image, Video and Paper workspaces, all drawing from one source library.' }] },
          { spaceBeforeMm: 1.5, runs: [{ text: 'Provider variety and bring-your-own credentials made the system flexible; typed connections, reproducible state and cross-device behavior made it dependable. The port itself became a promise: accept every valid form of material, reject the wrong ones, and preserve enough context to repeat the work.' }] },
        ],
        typography: { fontFamily: SAFE_SANS, fontSizePt: 8.7, leadingPt: 11.5, align: 'justify', alignLast: 'left', hyphenate: true, lineBreak: 'pretty' }, zIndex: 5,
      }),
      frame('en-p2-article-pull-rule', 'shape', 142, 67, 3, 47, { label: 'Article Pull Quote Rule', fillColor: COLORS.cobalt, cornerRadiusMm: 1.5, zIndex: 3 }),
      frame('en-p2-article-pull', 'text', 151, 67, 45, 47, {
        label: 'Article Pull Quote', text: 'One source can now travel from generation to edit to timeline to type.', paragraphStyleId: 'p-pull',
        typography: { fontFamily: DISPLAY, fontSizePt: 14.5, leadingPt: 17, fontWeight: '700', color: COLORS.cobalt, lineBreak: 'balance', hyphenate: false }, zIndex: 5,
      }),
      frame('en-p2-article-close', 'text', 151, 119, 45, 19, {
        label: 'Article Closing', paragraphStyleId: 'p-body', threadId: 'signaloom-feature', threadOrder: 3,
        text: 'Paper closes the loop. This spread is the proof: Flow-made assets, deliberately typeset in two languages.',
        typography: { fontFamily: SAFE_SANS, fontSizePt: 7.7, leadingPt: 9.7, fontWeight: '600', color: COLORS.ink, hyphenate: false, lineBreak: 'pretty' }, zIndex: 5,
      }),
      frame('en-p2-divider', 'shape', 0, 145.5, 210, 1.5, { label: 'Article / Advertisement Divider', fillColor: COLORS.coral, zIndex: 15 }),
      frame('en-p2-ad-image', 'image', 0, MIDPOINT_MM, 210, MIDPOINT_MM, {
        label: 'Ad Campaign Image · Flow Asset', asset: adAsset, fit: 'cover', imageScale: 1.02, objectStyleId: 'o-full-bleed-image', zIndex: 1,
      }),
      frame('en-p2-ad-overlay', 'shape', 0, MIDPOINT_MM, 108, MIDPOINT_MM, {
        label: 'Ad Copy Gradient', fillColor: COLORS.blueBlack, fillOpacity: 0.94,
        fillGradient: { type: 'linear', fromColor: COLORS.blueBlack, toColor: '#07142600', angleDeg: 90 }, opacity: 0.97, objectStyleId: 'o-ad-overlay', zIndex: 3,
      }),
      frame('en-p2-ad-marker', 'text', 14, 158, 78, 8, {
        label: 'Ad Marker', text: 'ADVERTISEMENT / DEMO', paragraphStyleId: 'p-running',
        typography: { fontFamily: MONO, fontSizePt: 6.6, leadingPt: 8, tracking: 110, fontWeight: '700', color: COLORS.cyan, hyphenate: false }, zIndex: 7,
      }),
      frame('en-p2-ad-headline', 'text', 14, 177, 76, 49, {
        label: 'Ad Headline', paragraphStyleId: 'p-ad-display',
        richText: [{ runs: [{ text: 'WEAR THE\n', fontWeight: '300', color: COLORS.white }, { text: 'CONNECTION.', fontWeight: '800', color: COLORS.white, tracking: -15 }] }],
        typography: { fontFamily: DISPLAY, fontSizePt: 28, leadingPt: 28, tracking: -10, fontWeight: '800', color: COLORS.white, lineBreak: 'balance', hyphenate: false }, zIndex: 7,
      }),
      frame('en-p2-ad-product', 'text', 14, 234, 76, 25, {
        label: 'Ad Product Name', richText: [{ runs: [
          { text: 'SLOAN STUDIO\n', fontFamily: MONO, fontSizePt: 7.2, fontWeight: '700', tracking: 90, color: COLORS.coral },
          { text: 'SIGNAL LOOP T-SHIRT', fontSizePt: 10.5, fontWeight: '700', color: COLORS.white },
        ] }],
        typography: { fontFamily: SAFE_SANS, fontSizePt: 10, leadingPt: 13, color: COLORS.white, hyphenate: false }, zIndex: 7,
      }),
      frame('en-p2-ad-japanese', 'text', 92, 164, 10, 65, {
        label: 'Ad Japanese Accent', text: '織るものを、着る。',
        typography: { fontFamily: JP_SANS, fontSizePt: 8.5, leadingPt: 11, tracking: 80, fontWeight: '700', color: COLORS.coral, writingMode: 'vertical-rl', textOrientation: 'mixed', lineBreakStrict: true, hyphenate: false }, zIndex: 7,
      }),
      frame('en-p2-ad-disclaimer', 'text', 14, 276, 120, 10, {
        label: 'Ad Demo Disclaimer', text: 'CONCEPT DEMO — NOT A REAL PRODUCT — NOT FOR SALE', paragraphStyleId: 'p-ad-legal',
        typography: { fontFamily: MONO, fontSizePt: 6.2, leadingPt: 7.5, tracking: 30, fontWeight: '700', color: COLORS.white, hyphenate: false }, zIndex: 8,
      }),
      frame('en-p2-ad-folio', 'text', 190, 284, 8, 7, {
        label: 'Ad Page Folio', text: '02', typography: { fontFamily: MONO, fontSizePt: 7, leadingPt: 8, align: 'right', fontWeight: '700', color: COLORS.white, hyphenate: false }, zIndex: 8,
      }),
    ],
  };
}

function japanesePageOne(hero) {
  const heroAsset = managedImageAsset(hero, 'Flow・Signaloom特集ヒーロー', 896, 1200);
  return {
    id: 'jp-page-1',
    pageNumber: 1,
    parentPageId: 'parent-jp-feature',
    guides: pageGuides([{ id: 'guide-h-hero-jp', orientation: 'horizontal', positionMm: 122, label: '写真開始' }]),
    frames: [
      frame('jp-p1-top-rule', 'shape', 0, 0, 210, 4, { label: '特集コバルト罫', fillColor: COLORS.cobalt, zIndex: 10 }),
      frame('jp-p1-masthead', 'text', 14, 12, 112, 8, {
        label: '雑誌名', text: 'SLOOM / MATERIAL SYSTEMS', paragraphStyleId: 'p-running',
        typography: { fontFamily: MONO, fontSizePt: 7.2, leadingPt: 8, tracking: 130, fontWeight: '700', color: COLORS.cobalt, hyphenate: false }, zIndex: 12,
      }),
      frame('jp-p1-issue', 'text', 142, 12, 54, 8, {
        label: '号数', text: 'デモ特別号 01  /  2026', paragraphStyleId: 'p-running',
        typography: { fontFamily: JP_SANS, fontSizePt: 6.8, leadingPt: 8, tracking: 45, align: 'right', color: COLORS.muted, fontWeight: '600', hyphenate: false, lineBreakStrict: true }, zIndex: 12,
      }),
      frame('jp-p1-headline', 'text', 14, 29, 152, 43, {
        label: '特集見出し', text: 'シグナルを織る', paragraphStyleId: 'p-display',
        typography: { fontFamily: JP_SANS, fontSizePt: 35, leadingPt: 40, tracking: 20, fontWeight: '800', color: COLORS.ink, lineBreak: 'balance', lineBreakStrict: true, hyphenate: false }, zIndex: 12,
      }),
      frame('jp-p1-side-title', 'text', 169, 27, 29, 68, {
        label: '縦組み副題', text: '生成から誌面へ\nつながる制作環境', paragraphStyleId: 'p-pull',
        typography: { fontFamily: JP_SANS, fontSizePt: 8.5, leadingPt: 12, tracking: 25, fontWeight: '700', color: COLORS.coral, writingMode: 'vertical-rl', textOrientation: 'mixed', lineBreakStrict: true, hyphenate: false }, zIndex: 12,
      }),
      frame('jp-p1-deck', 'text', 14, 78, 134, 31, {
        label: 'リード', paragraphStyleId: 'p-deck',
        richText: [{ runs: [
          { text: 'ノードのキャンバスから始まったSignaloomは、画像、映像、そして組版をつなぐ', fontWeight: '500' },
          { text: 'ひとつの制作スタジオ', fontWeight: '800', color: COLORS.cobalt, underline: true },
          { text: 'へ育っていった。' },
        ] }],
        typography: { fontFamily: JP_SANS, fontSizePt: 12, leadingPt: 18, fontWeight: '500', lineBreak: 'pretty', lineBreakStrict: true, hyphenate: false }, zIndex: 12,
      }),
      frame('jp-p1-byline', 'text', 14, 111, 154, 7, {
        label: 'クレジット', text: '文／SLOOM STUDIO　　ビジュアル／FLOWで生成', paragraphStyleId: 'p-running',
        typography: { fontFamily: JP_SANS, fontSizePt: 6.5, leadingPt: 8, tracking: 45, fontWeight: '600', color: COLORS.muted, hyphenate: false, lineBreakStrict: true }, zIndex: 12,
      }),
      frame('jp-p1-meta-card', 'shape', 151, 78, 25, 31, {
        label: '機能メタデータ', fillColor: COLORS.cobalt, fillGradient: { type: 'linear', fromColor: COLORS.cobalt, toColor: '#0b246f', angleDeg: 135 }, cornerRadiusMm: 1.5, strokeColor: COLORS.cyan, strokeWidthMm: 0.25, zIndex: 9,
      }),
      frame('jp-p1-meta-text', 'text', 155, 83, 17, 20, {
        label: '機能数', text: '四つの\nワーク\nスペース',
        typography: { fontFamily: JP_SANS, fontSizePt: 7, leadingPt: 8.5, align: 'center', tracking: 25, fontWeight: '700', color: COLORS.white, hyphenate: false, lineBreakStrict: true }, zIndex: 13,
      }),
      frame('jp-p1-hero', 'image', 0, 122, 210, 175, {
        label: 'ヒーロー画像・Flow素材', asset: heroAsset, fit: 'cover', imageScale: 1.03, imageOffsetXPercent: 3, objectStyleId: 'o-full-bleed-image', zIndex: 1,
      }),
      frame('jp-p1-hero-wash', 'shape', 0, 122, 113, 175, {
        label: 'ヒーロー階調', fillColor: COLORS.blueBlack, fillOpacity: 0.83, fillGradient: { type: 'linear', fromColor: COLORS.blueBlack, toColor: '#07142600', angleDeg: 90 }, opacity: 0.93, zIndex: 3,
      }),
      frame('jp-p1-opening-card', 'shape', 12, 177, 83, 102, { label: '本文カード', fillColor: COLORS.paper, fillOpacity: 0.96, cornerRadiusMm: 1.4, zIndex: 5 }),
      frame('jp-p1-opening', 'text', 19, 185, 68, 84, {
        label: '記事本文・冒頭', paragraphStyleId: 'p-body', threadId: 'signaloom-feature', threadOrder: 0,
        richText: [
          { spaceAfterMm: 2, runs: [{ text: 'Signaloomは、生成AIを単なるプロンプト欄ではなく、素材と工程が見える「制作卓」にしたいという発想から始まった。', fontWeight: '500' }] },
          { runs: [{ text: '最初のFlowキャンバスでは、モデルがノードになり、指示が素材になり、意図から出力までの道筋が一本のグラフとして現れた。' }] },
        ],
        typography: { fontFamily: JP_SANS, fontSizePt: 9, leadingPt: 14.2, fontWeight: '400', color: COLORS.ink, writingMode: 'vertical-rl', textOrientation: 'mixed', lineBreakStrict: true, hyphenate: false }, zIndex: 7,
      }),
      frame('jp-p1-pull-rule', 'shape', 111, 157, 4, 57, { label: '引用コーラル罫', fillColor: COLORS.coral, cornerRadiusMm: 2, zIndex: 6 }),
      frame('jp-p1-pull', 'text', 123, 154, 44, 68, {
        label: '縦組み引用', text: 'グラフは目的地ではない。\nそれは創造を織るための機だった。', paragraphStyleId: 'p-pull',
        typography: { fontFamily: JP_SANS, fontSizePt: 13.5, leadingPt: 20, fontWeight: '700', color: COLORS.white, writingMode: 'vertical-rl', textOrientation: 'mixed', lineBreakStrict: true, emphasis: 'sesame', hyphenate: false }, zIndex: 7,
      }),
      frame('jp-p1-caption', 'text', 105, 264, 90, 17, {
        label: '写真キャプション', text: 'FLOWを素材にする——シグナルの軌跡が、誌面を貫く織物へ変わる。', paragraphStyleId: 'p-caption',
        typography: { fontFamily: JP_SANS, fontSizePt: 7.2, leadingPt: 10, tracking: 25, fontWeight: '600', color: COLORS.white, hyphenate: false, lineBreakStrict: true }, zIndex: 7,
      }),
      frame('jp-p1-folio', 'text', 190, 284, 8, 7, { label: 'ページ番号', text: '01', typography: { fontFamily: MONO, fontSizePt: 7, leadingPt: 8, align: 'right', fontWeight: '700', color: COLORS.white, hyphenate: false }, zIndex: 8 }),
    ],
  };
}

function japanesePageTwo(ad) {
  const adAsset = managedImageAsset(ad, 'Flow・Sloan Studio Tシャツ広告合成', 1232, 832);
  return {
    id: 'jp-page-2',
    pageNumber: 2,
    parentPageId: 'parent-jp-feature',
    guides: pageGuides([{ id: 'guide-h-timeline-jp', orientation: 'horizontal', positionMm: 58, label: '年表基準' }]),
    frames: [
      frame('jp-p2-top-rule', 'shape', 0, 0, 210, 4, { label: '記事コバルト罫', fillColor: COLORS.cobalt, zIndex: 10 }),
      frame('jp-p2-running', 'text', 14, 12, 182, 7, {
        label: '記事柱', text: 'シグナルを織る　／　つながるクリエイティブスタジオの開発', paragraphStyleId: 'p-running',
        typography: { fontFamily: JP_SANS, fontSizePt: 6.8, leadingPt: 8, tracking: 70, fontWeight: '700', color: COLORS.cobalt, hyphenate: false, lineBreakStrict: true }, zIndex: 12,
      }),
      frame('jp-p2-timeline-label', 'text', 14, 24, 34, 7, { label: 'Timeline ラベル', text: '三つの転機', typography: { fontFamily: JP_SANS, fontSizePt: 7, leadingPt: 8, tracking: 85, fontWeight: '700', color: COLORS.coral, hyphenate: false, lineBreakStrict: true }, zIndex: 12 }),
      frame('jp-p2-timeline-01', 'shape', 14, 34, 56, 23, { label: 'Timeline 01 カード', fillColor: '#e4e8f4', strokeColor: COLORS.cobalt, strokeWidthMm: 0.25, cornerRadiusMm: 1, zIndex: 2 }),
      frame('jp-p2-timeline-01-text', 'text', 19, 38, 46, 15, { label: 'Timeline 01', richText: [{ runs: [{ text: '01  FLOW\n', fontWeight: '800', color: COLORS.cobalt }, { text: '指示と工程が、再現できるグラフになる。' }] }], typography: { fontFamily: JP_SANS, fontSizePt: 7.3, leadingPt: 9.5, fontWeight: '500', hyphenate: false, lineBreakStrict: true }, zIndex: 4 }),
      frame('jp-p2-timeline-02', 'shape', 76, 34, 56, 23, { label: 'Timeline 02 カード', fillColor: '#d8f5f2', strokeColor: COLORS.cyan, strokeWidthMm: 0.25, cornerRadiusMm: 1, zIndex: 2 }),
      frame('jp-p2-timeline-02-text', 'text', 81, 38, 46, 15, { label: 'Timeline 02', richText: [{ runs: [{ text: '02  STUDIO\n', fontWeight: '800', color: COLORS.cobalt }, { text: '画像、映像、素材庫が同じ制作環境につながる。' }] }], typography: { fontFamily: JP_SANS, fontSizePt: 7.3, leadingPt: 9.5, fontWeight: '500', hyphenate: false, lineBreakStrict: true }, zIndex: 4 }),
      frame('jp-p2-timeline-03', 'shape', 138, 34, 58, 23, { label: 'Timeline 03 カード', fillColor: '#fbe3dc', strokeColor: COLORS.coral, strokeWidthMm: 0.25, cornerRadiusMm: 1, zIndex: 2 }),
      frame('jp-p2-timeline-03-text', 'text', 143, 38, 48, 15, { label: 'Timeline 03', richText: [{ runs: [{ text: '03  PAPER\n', fontWeight: '800', color: COLORS.coral }, { text: '生成素材が、意図をもつ出版物になる。' }] }], typography: { fontFamily: JP_SANS, fontSizePt: 7.3, leadingPt: 9.5, fontWeight: '500', hyphenate: false, lineBreakStrict: true }, zIndex: 4 }),
      frame('jp-p2-article-v1', 'text', 18, 65, 48, 73, {
        label: 'Article 縦組み本文一', paragraphStyleId: 'p-body', threadId: 'signaloom-feature', threadOrder: 1,
        text: 'やがて、グラフだけでは足りないことが見えてきた。画像には修整が、映像には時間軸が、完成した物語には余白と階層と文字が必要だった。そこでSignaloomは、Flow、Image、Video、Paperを行き来できる制作環境へ広がった。',
        typography: { fontFamily: JP_SANS, fontSizePt: 8.8, leadingPt: 13.2, writingMode: 'vertical-rl', textOrientation: 'mixed', lineBreakStrict: true, hyphenate: false }, zIndex: 5,
      }),
      frame('jp-p2-article-v2', 'text', 73, 65, 48, 73, {
        label: 'Article 縦組み本文二', paragraphStyleId: 'p-body', threadId: 'signaloom-feature', threadOrder: 2,
        text: '多様なプロバイダー、自分の認証情報、型付きの接続、再現できる状態、端末を越える挙動。これらは後付けの機能ではなく、素材を安心して渡すための設計条件になった。ポートは「受け取れるものを漏らさず受け取り、違うものを拒む」という約束である。',
        typography: { fontFamily: JP_SANS, fontSizePt: 8.8, leadingPt: 13.2, writingMode: 'vertical-rl', textOrientation: 'mixed', lineBreakStrict: true, hyphenate: false }, zIndex: 5,
      }),
      frame('jp-p2-article-v3', 'text', 128, 65, 30, 73, {
        label: 'Article 縦組み結び', paragraphStyleId: 'p-body', threadId: 'signaloom-feature', threadOrder: 3,
        text: 'Paperが輪を閉じる。この見開き自体が証拠だ。Flowで生まれた素材が、二つの言語で誌面になる。',
        typography: { fontFamily: JP_SANS, fontSizePt: 8.5, leadingPt: 13, fontWeight: '600', writingMode: 'vertical-rl', textOrientation: 'mixed', lineBreakStrict: true, hyphenate: false }, zIndex: 5,
      }),
      frame('jp-p2-article-pull-rule', 'shape', 164, 66, 3, 54, { label: 'Article 引用罫', fillColor: COLORS.cobalt, cornerRadiusMm: 1.5, zIndex: 3 }),
      frame('jp-p2-article-pull', 'text', 168, 65, 30, 66, {
        label: 'Article 縦組み引用', text: '生成から誌面へ、素材は旅をする。', paragraphStyleId: 'p-pull',
        typography: { fontFamily: JP_SANS, fontSizePt: 10.5, leadingPt: 15, tracking: -5, fontWeight: '700', color: COLORS.cobalt, writingMode: 'vertical-rl', textOrientation: 'mixed', lineBreakStrict: true, emphasis: 'sesame', hyphenate: false }, zIndex: 5,
      }),
      frame('jp-p2-article-columns-evidence', 'text', 14, 138, 119, 7.5, {
        label: 'Article 組版機能注記', text: '6段グリッド／ベースライングリッド／禁則処理／縦組み／管理アセット', columns: 2, columnGutterMm: 6, columnRule: true, columnBalance: true,
        typography: { fontFamily: MONO, fontSizePt: 5.9, leadingPt: 7, tracking: 25, fontWeight: '700', color: COLORS.muted, hyphenate: false }, zIndex: 5,
      }),
      frame('jp-p2-divider', 'shape', 0, 145.5, 210, 1.5, { label: '記事・広告境界', fillColor: COLORS.coral, zIndex: 15 }),
      frame('jp-p2-ad-image', 'image', 0, MIDPOINT_MM, 210, MIDPOINT_MM, { label: 'Ad キャンペーン画像・Flow素材', asset: adAsset, fit: 'cover', imageScale: 1.02, objectStyleId: 'o-full-bleed-image', zIndex: 1 }),
      frame('jp-p2-ad-overlay', 'shape', 0, MIDPOINT_MM, 108, MIDPOINT_MM, { label: 'Ad コピー階調', fillColor: COLORS.blueBlack, fillOpacity: 0.94, fillGradient: { type: 'linear', fromColor: COLORS.blueBlack, toColor: '#07142600', angleDeg: 90 }, opacity: 0.97, objectStyleId: 'o-ad-overlay', zIndex: 3 }),
      frame('jp-p2-ad-marker', 'text', 14, 158, 78, 8, { label: 'Ad 表示', text: 'ADVERTISEMENT / DEMO', paragraphStyleId: 'p-running', typography: { fontFamily: MONO, fontSizePt: 6.6, leadingPt: 8, tracking: 110, fontWeight: '700', color: COLORS.cyan, hyphenate: false }, zIndex: 7 }),
      frame('jp-p2-ad-headline', 'text', 14, 174, 42, 82, {
        label: 'Ad 縦組み見出し', text: 'つながりを、着る。', paragraphStyleId: 'p-ad-display',
        typography: { fontFamily: JP_SANS, fontSizePt: 23, leadingPt: 32, tracking: 25, fontWeight: '800', color: COLORS.white, writingMode: 'vertical-rl', textOrientation: 'mixed', lineBreakStrict: true, hyphenate: false }, zIndex: 7,
      }),
      frame('jp-p2-ad-product', 'text', 58, 181, 42, 45, {
        label: 'Ad 商品名', richText: [{ runs: [
          { text: 'SLOAN STUDIO\n', fontFamily: MONO, fontSizePt: 7, fontWeight: '700', tracking: 80, color: COLORS.coral },
          { text: 'SIGNAL LOOP\nTシャツ', fontFamily: JP_SANS, fontSizePt: 12, fontWeight: '700', color: COLORS.white },
        ] }], typography: { fontFamily: JP_SANS, fontSizePt: 11, leadingPt: 15, color: COLORS.white, hyphenate: false, lineBreakStrict: true }, zIndex: 7,
      }),
      frame('jp-p2-ad-copy', 'text', 58, 233, 42, 27, {
        label: 'Ad コピー', text: 'シグナルが交わる、その瞬間を胸元に。',
        typography: { fontFamily: JP_SANS, fontSizePt: 8, leadingPt: 12, fontWeight: '500', color: COLORS.white, lineBreakStrict: true, hyphenate: false }, zIndex: 7,
      }),
      frame('jp-p2-ad-disclaimer', 'text', 14, 275, 132, 11, {
        label: 'Ad デモ免責', text: 'コンセプトデモ／実在しない商品です／非売品', paragraphStyleId: 'p-ad-legal',
        typography: { fontFamily: JP_SANS, fontSizePt: 6.8, leadingPt: 8.5, tracking: 25, fontWeight: '700', color: COLORS.white, lineBreakStrict: true, hyphenate: false }, zIndex: 8,
      }),
      frame('jp-p2-ad-folio', 'text', 190, 284, 8, 7, { label: 'Ad ページ番号', text: '02', typography: { fontFamily: MONO, fontSizePt: 7, leadingPt: 8, align: 'right', fontWeight: '700', color: COLORS.white, hyphenate: false }, zIndex: 8 }),
    ],
  };
}

export function buildEnglishMagazine(heroRecord, adRecord, { now = Date.now() } = {}) {
  const document = baseDocument('Signaloom — Woven From Signals', false, now);
  document.pages = [englishPageOne(heroRecord), englishPageTwo(adRecord)];
  return document;
}

export function buildJapaneseMagazine(heroRecord, adRecord, { now = Date.now() } = {}) {
  const document = baseDocument('Signaloom — シグナルを織る', true, now);
  document.pages = [japanesePageOne(heroRecord), japanesePageTwo(adRecord)];
  return document;
}

export function createAssetRecord(bytes, fileName) {
  const copy = new Uint8Array(bytes);
  const sha256 = createHash('sha256').update(copy).digest('hex');
  return {
    ref: {
      id: `sha256:${sha256}`,
      sha256,
      mimeType: extname(fileName).toLowerCase() === '.jpg' || extname(fileName).toLowerCase() === '.jpeg' ? 'image/jpeg' : 'image/png',
      byteLength: copy.byteLength,
      fileName,
    },
    bytes: copy,
  };
}

function assetArchivePath(ref) {
  const extension = extname(ref.fileName || '').replace(/^\./, '').toLowerCase() || (ref.mimeType === 'image/jpeg' ? 'jpg' : 'png');
  return `assets/${ref.sha256}.${extension}`;
}

export function packMagazineContainer(document, records) {
  const manifest = {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    kind: 'paper',
    document,
    assets: records.map((record) => record.ref),
  };
  const files = { 'manifest.json': strToU8(JSON.stringify(manifest)) };
  for (const record of records) {
    const actual = createHash('sha256').update(record.bytes).digest('hex');
    if (actual !== record.ref.sha256 || record.bytes.byteLength !== record.ref.byteLength) {
      throw new Error(`Asset record ${record.ref.id} failed hash or byte-length validation.`);
    }
    files[assetArchivePath(record.ref)] = record.bytes;
  }
  return zipSync(files, { level: 6 });
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--assets') options.assets = argv[++index];
    else if (arg === '--output') options.output = argv[++index];
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function generateFiles({ assets, output }) {
  const assetDir = resolve(assets);
  const outputDir = resolve(output);
  const heroPath = join(assetDir, 'hero.png');
  const adPath = join(assetDir, 'ad-composite.png');
  const hero = createAssetRecord(readFileSync(heroPath), basename(heroPath));
  const ad = createAssetRecord(readFileSync(adPath), basename(adPath));
  const now = 1_784_132_800_000;
  const editions = [
    ['Signaloom-Story-English-Magazine.slppr', buildEnglishMagazine(hero, ad, { now })],
    ['Signaloom-Story-Japanese-Magazine.slppr', buildJapaneseMagazine(hero, ad, { now })],
  ];
  mkdirSync(outputDir, { recursive: true });
  return editions.map(([fileName, document]) => {
    const path = join(outputDir, fileName);
    writeFileSync(path, packMagazineContainer(document, [hero, ad]));
    return path;
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.assets || !options.output) {
    process.stdout.write('Usage: node scripts/create-signaloom-magazine-demo.mjs --assets <asset-dir> --output <output-dir>\n');
    process.exitCode = options.help ? 0 : 1;
    return;
  }
  for (const path of generateFiles(options)) {
    process.stdout.write(`${path}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
