import type { ToolEnv, ToolHandler, Point } from './types';
import {
  buildTextLayerName,
  normalizeImageTextStyle,
  rasterizeImageTextStyle,
} from '../ImageTextLayer';
import type { ImageLayer } from '../../../types/imageEditor';
import { useTextInputDialogStore } from '../../../store/textInputDialogStore';

export const textTool: ToolHandler = {
  onPointerDown(env, point) {
    const current = env.store.textToolSettings;
    const style = normalizeImageTextStyle(current);

    if (!style.content.trim()) {
      void (async () => {
        const content = await useTextInputDialogStore.getState().requestTextInput({
          title: 'Add Image Text',
          message: 'Enter the text to place on the active image document.',
          label: 'Text content',
          initialValue: current.content || 'Text',
          placeholder: 'Text',
          confirmLabel: 'Place Text',
        });
        if (!content?.trim()) return;
        env.store.setTextToolSettings({ content });
        addTextLayer(env, point, normalizeImageTextStyle({ ...current, content }));
      })();
      return;
    }

    addTextLayer(env, point, style);
  },
};

function addTextLayer(
  env: ToolEnv,
  point: Point,
  style: ReturnType<typeof normalizeImageTextStyle>,
): void {
  const bitmap = rasterizeImageTextStyle(style);

  const layer: ImageLayer = {
    id: `layer-text-${Date.now()}`,
    name: buildTextLayerName(style.content),
    type: 'text',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    x: Math.round(point.x),
    y: Math.round(point.y - style.fontSize),
    bitmap,
    bitmapVersion: 0,
    mask: null,
    text: style,
    metadata: { editableText: true },
  };
  env.store.addLayer(env.doc.id, layer);
  env.requestRender();
}
