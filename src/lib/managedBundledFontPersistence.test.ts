import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ImageDocument } from '../types/imageEditor';
import type { AppNode, EditorAsset, EditorStageObject, EditorVisualClip } from '../types/flow';
import { sanitizeImageEditorSnapshot, sanitizeFlowSnapshot } from './projectValidation';

function sampleInventory() {
  return {
    schemaVersion: 1,
    catalogFamilyCount: 1,
    faceCount: 1,
    criticalErrorCount: 0,
    families: [{
      collection: 'base',
      family: 'Liberation Sans',
      slug: 'liberationsans',
      source: { url: 'https://example.test/liberation', commit: 'release-2.1.5' },
      licenses: [{
        file: 'collection/base/liberationsans/LICENSE',
        spdx: 'OFL-1.1',
        sha256: '93fed46019c38bbe566b479d22148e2e8a1e85ada614accb0211c37b2c61c19b',
        byteLength: 4414,
      }],
      faces: [{
        file: 'collection/base/liberationsans/LiberationSans-Regular.ttf',
        collectionIndex: 0,
        sha256: 'baccc64becc3eb7d104b7c84d99f5314a0a1f896e2b3ea6c2f22fc08d2003bee',
        byteLength: 410820,
        family: 'Liberation Sans',
        subfamily: 'Regular',
        fullName: 'Liberation Sans Regular',
        postscriptName: 'LiberationSans-Regular',
        version: 'Version 2.1.5',
        weight: 400,
        stretchPercent: 100,
        glyphCount: 2327,
        variable: false,
        axes: [],
        fsType: 0,
        restrictedEmbedding: false,
        noSubsetting: false,
        bitmapEmbeddingOnly: false,
        hasVerticalSubstitution: false,
      }],
      errors: [],
      warnings: [],
    }],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FBL-011 fresh-process bundled face persistence', () => {
  it('restores Image and Video exact face references and registers verified bytes in a fresh module graph', async () => {
    const authorRuntime = await import('./bundledFontLibrary');
    const catalog = authorRuntime.parseBundledFontInventory(sampleInventory());
    const family = catalog.families[0];
    const face = family.faces[0];
    const managedFace = authorRuntime.createBundledFontFaceReference(family, face);

    const imageDocument = {
      id: 'image-doc',
      title: 'Managed face image',
      width: 640,
      height: 360,
      layers: [{
        id: 'image-text',
        name: 'Exact title',
        type: 'text',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        x: 0,
        y: 0,
        bitmap: null,
        bitmapVersion: 1,
        mask: null,
        text: {
          content: 'Fresh Image',
          fontFamily: family.family,
          fontSize: 48,
          fontWeight: '400',
          fontStyle: 'normal',
          fontKerning: 'auto',
          fontVariantCaps: 'normal',
          letterSpacing: 0,
          baselineShift: 0,
          boxWidth: null,
          boxHeight: null,
          wrap: true,
          color: '#ffffff',
          lineHeight: 1.15,
          align: 'left',
          verticalAlign: 'top',
          warp: 'none',
          managedFace,
        },
      }],
      activeLayerId: 'image-text',
      activeLayerEditTarget: 'layer',
      hasSelection: false,
      selectionVersion: 0,
      savedSelectionChannels: [],
      spotChannels: [],
      viewport: { zoom: 1, panX: 0, panY: 0 },
      dirty: false,
      snapshots: [],
    } satisfies ImageDocument;

    const textDefaults = {
      text: 'Reusable title',
      fontFamily: family.family,
      fontWeight: face.weight,
      fontStyle: 'normal' as const,
      fontSizePx: 72,
      color: '#f8fafc',
      textEffect: 'shadow' as const,
      textBackgroundOpacityPercent: 0,
      managedFace,
    };
    const asset: EditorAsset = {
      id: 'asset-text', kind: 'text', label: 'Reusable title', createdAt: 1, updatedAt: 1, textDefaults,
    };
    const clip: EditorVisualClip = {
      id: 'clip-text', sourceNodeId: asset.id, sourceKind: 'text', trackIndex: 0, startMs: 0,
      sourceInMs: 0, trimStartMs: 0, trimEndMs: 0, playbackRate: 1, reversePlayback: false,
      fitMode: 'contain', scalePercent: 100, scaleMotionEnabled: false, endScalePercent: 100,
      opacityPercent: 100, rotationDeg: 0, rotationMotionEnabled: false, endRotationDeg: 0,
      flipHorizontal: false, flipVertical: false, positionX: 0, positionY: 0, motionEnabled: false,
      endPositionX: 0, endPositionY: 0, cropLeftPercent: 0, cropRightPercent: 0,
      cropTopPercent: 0, cropBottomPercent: 0, cropPanXPercent: 0, cropPanYPercent: 0,
      cropRotationDeg: 0, filterStack: [], transitionIn: 'none', transitionOut: 'none',
      transitionDurationMs: 0, textContent: 'Timeline title', textFontFamily: family.family,
      textSizePx: 72, textColor: '#f8fafc', textEffect: 'shadow', textBackgroundOpacityPercent: 0,
      textTypography: { fontWeight: face.weight, fontStyle: 'normal', managedFace },
    };
    const stageObject: EditorStageObject = {
      id: 'stage-text', kind: 'text', x: 0, y: 0, width: 400, height: 120, rotationDeg: 0,
      opacityPercent: 100, blendMode: 'normal', text: 'Stage title', fontFamily: family.family,
      fontWeight: face.weight, fontStyle: 'normal', fontSizePx: 72, color: '#f8fafc', managedFace,
    };
    const compositionNode = {
      id: 'composition', type: 'composition', position: { x: 0, y: 0 },
      data: { editorAssets: [asset], editorVisualClips: [clip], editorStageObjects: [stageObject] },
    } as AppNode;

    const authorImageStore = await import('../store/imageEditorStore');
    const authorFlowStore = await import('../store/flowStore');
    const authorProjectActions = await import('./projectDocumentActions');
    authorImageStore.useImageEditorStore.setState({ documents: [imageDocument], activeDocId: imageDocument.id });
    authorImageStore.useImageEditorStore.getState().duplicateLayer(imageDocument.id, 'image-text');
    expect(authorImageStore.useImageEditorStore.getState().documents[0].layers[1].text?.managedFace).toEqual(managedFace);
    authorFlowStore.useFlowStore.getState().replaceFlowSnapshot({ nodes: [compositionNode], edges: [] });
    const savedProject = await authorProjectActions.buildCurrentProjectDocument({
      id: 'managed-font-authoring',
      name: 'Managed font authoring',
    });
    expect(savedProject.imageEditor?.documents[0].layers[0].text?.managedFace).toEqual(managedFace);
    expect(savedProject.flow.nodes[0].data.editorVisualClips?.[0]?.textTypography?.managedFace).toEqual(managedFace);
    const transferredImage = JSON.parse(JSON.stringify(savedProject.imageEditor));
    const transferredFlow = JSON.parse(JSON.stringify(savedProject.flow));

    vi.resetModules();
    const freshRuntime = await import('./bundledFontLibrary');
    const freshCollectors = await import('./managedBundledFonts');
    const restoredImage = sanitizeImageEditorSnapshot(transferredImage)!;
    const restoredFlow = sanitizeFlowSnapshot(transferredFlow);
    const restoredNode = restoredFlow.nodes[0];
    const refs = [
      ...freshCollectors.collectImageBundledFontFaceReferences(restoredImage.documents),
      ...freshCollectors.collectVideoBundledFontFaceReferences({
        assets: restoredNode.data.editorAssets,
        visualClips: restoredNode.data.editorVisualClips,
        stageObjects: restoredNode.data.editorStageObjects,
      }),
    ];

    expect(refs).toHaveLength(5);
    expect(new Set(refs.map((ref) => ref.faceId))).toEqual(new Set([face.id]));
    expect(refs[0]).toEqual({
      kind: 'bundled', faceId: face.id, family: family.family, weight: 400, style: 'normal', stretchPercent: 100,
    });
    expect(restoredImage.documents[0].layers[0].text?.managedFace).toEqual(managedFace);
    expect(restoredImage.documents[0].layers[1].text?.managedFace).toEqual(managedFace);
    expect(restoredNode.data.editorAssets?.[0]?.textDefaults?.managedFace).toEqual(managedFace);
    expect(restoredNode.data.editorVisualClips?.[0]?.textTypography?.managedFace).toEqual(managedFace);
    expect(restoredNode.data.editorStageObjects?.[0]?.kind).toBe('text');
    expect(restoredNode.data.editorStageObjects?.[0]).toMatchObject({ managedFace });

    const fontBytes = readFileSync(resolve(process.cwd(), 'public/fonts/liberation/LiberationSans-Regular.ttf'));
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('font-inventory.json')) return Response.json(sampleInventory());
      if (url.endsWith('LiberationSans-Regular.ttf')) return new Response(fontBytes);
      return new Response('missing', { status: 404 });
    }) as unknown as typeof fetch;
    const addedFaces: unknown[] = [];
    const fontFaceSources: unknown[] = [];
    const fontFaceRecords: Array<{ family: string; descriptors: FontFaceDescriptors }> = [];
    const renderedFonts: string[] = [];
    const canvasContext = {
      measureText: (text: string) => ({ width: text.length * 10 }),
      save: vi.fn(), restore: vi.fn(), fillText: vi.fn(), strokeText: vi.fn(),
      fontKerning: 'auto', fontStretch: '', fillStyle: '', strokeStyle: '', lineWidth: 0, lineJoin: 'round',
      textAlign: 'left', textBaseline: 'alphabetic', globalAlpha: 1,
      shadowColor: '', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
    } as unknown as CanvasRenderingContext2D;
    Object.defineProperty(canvasContext, 'font', {
      configurable: true,
      get: () => renderedFonts.at(-1) ?? '',
      set: (value: string) => { renderedFonts.push(value); },
    });
    const canvas = {
      width: 1,
      height: 1,
      getContext: () => canvasContext,
      toDataURL: () => 'data:image/png;base64,ZXhhY3Q=',
    };
    class FreshFontFace {
      familyName: string;
      descriptors: FontFaceDescriptors;

      constructor(familyName: string, source: unknown, descriptors: FontFaceDescriptors) {
        this.familyName = familyName;
        this.descriptors = descriptors;
        fontFaceSources.push(source);
        fontFaceRecords.push({ family: familyName, descriptors: this.descriptors });
      }
      async load() { return this; }
    }
    vi.stubGlobal('FontFace', FreshFontFace);
    vi.stubGlobal('document', {
      fonts: { add: (loaded: unknown) => addedFaces.push(loaded) },
      createElement: () => canvas,
    });

    vi.stubGlobal('fetch', fetchImpl);
    const freshProjectActions = await import('./projectDocumentActions');
    await freshProjectActions.restoreProjectDocument({
      schemaVersion: 1,
      id: 'transferred-project',
      name: 'Fresh managed fonts',
      savedAt: 1,
      flow: transferredFlow,
      imageEditor: transferredImage,
    });
    const freshImageStore = await import('../store/imageEditorStore');
    const freshFlowStore = await import('../store/flowStore');
    expect(freshImageStore.useImageEditorStore.getState().documents[0].layers[0].text?.managedFace).toEqual(managedFace);
    expect(freshFlowStore.useFlowStore.getState().nodes[0].data.editorVisualClips?.[0]?.textTypography?.managedFace).toEqual(managedFace);

    const report = await freshRuntime.ensureBundledFontFaceReferencesRegistered(refs, { fetchImpl });

    expect(report).toMatchObject({ ready: true, registeredFaceIds: [face.id] });
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('LiberationSans-Regular.ttf'),
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fontFaceSources[0]).toBeInstanceOf(ArrayBuffer);
    expect(fontFaceRecords[0]).toEqual({
      family: freshRuntime.bundledFontFaceRuntimeFamilyName(managedFace),
      descriptors: { style: 'normal', weight: '400', stretch: '100%' },
    });
    expect(fontFaceRecords[1]).toMatchObject({ family: 'Liberation Sans' });
    expect(addedFaces).toHaveLength(2);

    const freshImageText = await import('../components/ImageEditor/ImageTextLayer');
    const runtimeFamily = freshRuntime.bundledFontFaceRuntimeFamilyName(managedFace);
    expect(freshImageText.imageTextCanvasFont(restoredImage.documents[0].layers[0].text!)).toContain(
      `normal 400 48px "${runtimeFamily}"`,
    );
    const freshMedia = await import('./mediaComposition');
    const restoredClip = restoredNode.data.editorVisualClips![0];
    const rendered = await freshMedia.renderTextCard({
      text: restoredClip.textContent ?? '',
      fontFamily: restoredClip.textFontFamily,
      fontSizePx: restoredClip.textSizePx,
      color: restoredClip.textColor,
      effect: restoredClip.textEffect,
      opacityPercent: 100,
      typography: restoredClip.textTypography,
    });
    expect(rendered).toBe('data:image/png;base64,ZXhhY3Q=');
    expect(renderedFonts).toContain(`400 72px "${runtimeFamily}"`);
    expect(renderedFonts).not.toContain('400 72px "Liberation Sans"');
    expect((canvasContext as unknown as { fontStretch: string }).fontStretch).toBe('100%');
  });

  it('fails closed with an actionable missing-face preflight instead of accepting the family fallback', async () => {
    vi.resetModules();
    const runtime = await import('./bundledFontLibrary');
    const catalog = runtime.parseBundledFontInventory(sampleInventory());
    const ref = runtime.createBundledFontFaceReference(catalog.families[0], catalog.families[0].faces[0]);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => (
      String(input).endsWith('font-inventory.json')
        ? Response.json(sampleInventory())
        : new Response('forbidden', { status: 403 })
    )) as unknown as typeof fetch;
    vi.stubGlobal('FontFace', class {
      async load() { return this; }
    });
    vi.stubGlobal('document', { fonts: { add: vi.fn() } });

    await expect(runtime.ensureBundledFontFaceReferencesRegistered([ref], { fetchImpl })).rejects.toThrow(
      /Liberation Sans.*unavailable or unauthorized.*reinstall.*font library/i,
    );
  });
});
