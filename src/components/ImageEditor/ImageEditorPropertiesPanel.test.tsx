import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { ImageEditorPropertiesPanel } from './ImageEditorPropertiesPanel';
import { createEmptyImageDocument, useImageEditorStore } from '../../store/imageEditorStore';
import { DEFAULT_PROVIDER_SETTINGS } from '../../lib/providerCatalog';
import { useSettingsStore } from '../../store/settingsStore';
import {
  DEFAULT_BRUSH_SETTINGS,
  DEFAULT_SELECTION_TOOL_SETTINGS,
  DEFAULT_TEXT_TOOL_SETTINGS,
} from '../../types/imageEditor';

describe('ImageEditorPropertiesPanel', () => {
  beforeEach(() => {
    useImageEditorStore.setState({
      documents: [],
      activeDocId: null,
      tool: 'move',
      brushSettings: { ...DEFAULT_BRUSH_SETTINGS },
      selectionToolSettings: { ...DEFAULT_SELECTION_TOOL_SETTINGS },
      textToolSettings: { ...DEFAULT_TEXT_TOOL_SETTINGS },
      viewportContainerSize: { width: 0, height: 0 },
      undoStacks: {},
      redoStacks: {},
    });
    useSettingsStore.setState({
      providerSettings: { ...DEFAULT_PROVIDER_SETTINGS },
    });
  });

  it('fills dockable panel height instead of imposing a nested viewport-height scroll box', () => {
    const html = renderToStaticMarkup(<ImageEditorPropertiesPanel />);

    expect(html).toContain('h-full');
    expect(html).toContain('min-h-0');
    expect(html).toContain('overflow-y-auto');
    expect(html).not.toContain('max-h-[52vh]');
  });

  it('renders image resize, canvas resize, and upscale controls for an open document', () => {
    useImageEditorStore.getState().openDocument(createEmptyImageDocument({
      id: 'doc-1',
      title: 'image.png',
      width: 1024,
      height: 768,
    }));

    const html = renderToStaticMarkup(<ImageEditorPropertiesPanel />);

    expect(html).toContain('Image Size');
    expect(html).toContain('Canvas Size');
    expect(html).toContain('Upscale 2x');
  });

  it('shows the selected universal upscale method based on Android accelerator configuration', () => {
    useSettingsStore.getState().setProviderSetting('androidAcceleratorBaseUrl', 'http://192.168.1.42:8788');
    useSettingsStore.getState().setProviderSetting('androidAcceleratorDefaultUpscaler', 'upscaler_anime');
    useImageEditorStore.getState().openDocument(createEmptyImageDocument({
      id: 'doc-1',
      title: 'image.png',
      width: 1024,
      height: 768,
    }));

    const html = renderToStaticMarkup(<ImageEditorPropertiesPanel />);

    expect(html).toContain('Android accelerator: NPU/GPU upscaler');
    expect(html).toContain('upscaler_anime');
  });
});
