// Action behind the .slimg Flow node's Run button. Turns the connected image into a real, editable
// .slimg document, saves it through the native save-as dialog (or a browser/Android download), opens
// it as a tab in the Image workspace, and returns the new doc id (so the Flow node can bind to it for
// live sync) plus the flattened output. Kept free of React/flow-store imports so it composes cleanly.
import { createImageDocumentFromFile } from '../components/ImageEditor/ImageSourceDocument';
import { saveImageDocumentAsSlimg } from '../components/ImageEditor/ImageSlimgCodec';
import { imageDocumentToDataUrl } from '../components/ImageEditor/ImageDocumentExport';
import { useImageEditorStore } from '../store/imageEditorStore';
import { useEditorStore } from '../store/editorStore';
import { getSignalLoomNativeBridge } from './nativeApp';
import { downloadBlob, buildWorkspaceDownloadFilename } from '../shared/files/downloads';

export interface RunSlimgNodeInput {
  /** The resolved upstream image (data:/blob:/http/asset URL) to capture into the .slimg. */
  inputImageUrl: string;
  /** Optional title (e.g. the node's custom name); falls back to "Flow Image". */
  title?: string;
}

export interface RunSlimgNodeResult {
  /** Id of the opened Image document — the Flow node stores this to bind for live re-flatten. */
  docId: string;
  /** Flattened PNG data URL captured right after open (live-sync refreshes it on later edits). */
  flattened: string;
}

function makeSlimgDocId(): string {
  return `slimg-flow-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('webp')) return 'webp';
  return 'png';
}

export async function runSlimgNode(input: RunSlimgNodeInput): Promise<RunSlimgNodeResult> {
  const inputImageUrl = input.inputImageUrl?.trim();
  if (!inputImageUrl) {
    throw new Error('Connect an image to the .slimg node before saving.');
  }

  // 1. Resolve the connected image to a File the Image document loader understands.
  const response = await fetch(inputImageUrl);
  if (!response.ok) {
    throw new Error(`Could not read the input image (HTTP ${response.status}).`);
  }
  const blob = await response.blob();
  const mimeType = blob.type || 'image/png';
  const title = input.title?.trim() || 'Flow Image';
  const file = new File([blob], `${title}.${extensionForMimeType(mimeType)}`, { type: mimeType });

  // 2. Build a real ImageDocument with a stable id so the Flow node can bind to this exact tab.
  const docId = makeSlimgDocId();
  const doc = await createImageDocumentFromFile(file, { id: docId });

  // 3. Serialize + save-as. Electron gets the native dialog; browser/Android streams the download.
  const bytes = await saveImageDocumentAsSlimg(doc);
  const bridge = getSignalLoomNativeBridge();
  if (bridge?.saveImageDocumentFileAs) {
    await bridge.saveImageDocumentFileAs(bytes);
  } else {
    downloadBlob(
      new Blob([bytes as BlobPart], { type: 'application/octet-stream' }),
      buildWorkspaceDownloadFilename(doc.title, 'slimg'),
    );
  }

  // 4. Open it as a tab in Image and switch the workspace to show it.
  useImageEditorStore.getState().openDocument(doc);
  useEditorStore.getState().setWorkspaceView('image');

  // 5. Flatten for the node's initial output; the live-sync bridge keeps it current after edits.
  const flattened = await imageDocumentToDataUrl(doc);
  return { docId, flattened };
}
