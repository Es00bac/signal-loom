import type { ImageDocument } from '../../types/imageEditor';
import { createBitmap } from './LayerBitmap';
import { renderImageDocumentLayersToBitmap } from './ImageAdjustmentLayer';
import { maskToCanvas, type SelectionMask } from './SelectionMask';
import {
  cropSelectionToBounds,
  resolveGenerativeFillPlacementBounds,
  type GenerativeFillPlacementBounds,
} from './GenerativeFillGeometry';

export interface GenerativeFillRequestArtifacts {
  source: Blob;
  mask: Blob;
  placementBounds: GenerativeFillPlacementBounds;
}

const GENERATIVE_FILL_CONTEXT_PADDING_PX = 96;

export async function buildGenerativeFillRequestArtifacts(
  doc: ImageDocument,
  selection: SelectionMask,
): Promise<GenerativeFillRequestArtifacts> {
  const placementBounds = resolveGenerativeFillPlacementBounds(
    doc,
    selection,
    GENERATIVE_FILL_CONTEXT_PADDING_PX,
  );
  const flattened = renderImageDocumentLayersToBitmap(doc);
  const sourceCanvas = createBitmap(placementBounds.width, placementBounds.height);
  const sourceCtx = sourceCanvas.getContext('2d');
  if (!sourceCtx) throw new Error('Failed to acquire 2D context for generative fill source.');

  sourceCtx.drawImage(
    flattened,
    placementBounds.x,
    placementBounds.y,
    placementBounds.width,
    placementBounds.height,
    0,
    0,
    placementBounds.width,
    placementBounds.height,
  );

  const localSelection = cropSelectionToBounds(selection, placementBounds);
  const maskCanvas = maskToCanvas(localSelection, 255, 255, 255);

  return {
    source: await sourceCanvas.convertToBlob({ type: 'image/png' }),
    mask: await maskCanvas.convertToBlob({ type: 'image/png' }),
    placementBounds,
  };
}
