import type { FlowProjectDocument } from './projectLibrary';
import {
  replaceProjectDocument,
  replaceWithBlankProject,
  type DirtyImageReplacementAuthorization,
} from './projectDocumentActions';
import type { PaperLossSaveResult } from '../store/paperLossPreventionStore';
import { usePaperStore } from '../store/paperStore';

export interface NativeStartupProjectReplacementOptions {
  rememberedDocument?: FlowProjectDocument;
  startBlank: boolean;
  save: () => Promise<PaperLossSaveResult>;
  authorizeDirtyImageReplacement: DirtyImageReplacementAuthorization;
  /** Authority/request epoch captured before getNativeState began. */
  isStartupRequestCurrent: () => boolean;
}

export type NativeStartupProjectReplacementResult =
  | 'remembered-project'
  | 'blank-project'
  | 'preserved-live-work'
  | 'stale-startup';

/**
 * Delayed native state arrives after persisted renderer stores have hydrated. Treat those live
 * stores as authoritative and run startup through the same closed replacement policy as an
 * explicit Open/New action. In particular, storage markers are not evidence that Paper is clean.
 */
export async function applyNativeStartupProjectReplacement(
  options: NativeStartupProjectReplacementOptions,
): Promise<NativeStartupProjectReplacementResult> {
  let stale = false;
  const isReplacementRequestCurrent = () => {
    let current = false;
    try {
      current = options.isStartupRequestCurrent();
    } catch {
      current = false;
    }
    if (!current) stale = true;
    return current;
  };

  try {
    if (options.rememberedDocument) {
      const replaced = await replaceProjectDocument(options.rememberedDocument, {
        key: 'app:startup-open-project',
        title: 'Save Paper changes before opening the remembered project?',
        message: 'Startup found live Paper changes before the remembered project finished loading. Save the current project, discard with recovery, or cancel.',
        save: options.save,
        authorizeDirtyImageReplacement: options.authorizeDirtyImageReplacement,
        transactionBookkeeping: 'reset-source-library-native-sync',
        isReplacementRequestCurrent,
      });
      return replaced ? 'remembered-project' : stale ? 'stale-startup' : 'preserved-live-work';
    }

    if (!options.startBlank) return 'preserved-live-work';
    const replaced = await replaceWithBlankProject({
      key: 'app:startup-blank-project',
      title: 'Save Paper changes before starting the workspace?',
      message: 'Startup found live Paper changes before the blank workspace was ready. Save the current project, discard with recovery, or cancel.',
      save: options.save,
      authorizeDirtyImageReplacement: options.authorizeDirtyImageReplacement,
      transactionBookkeeping: 'reset-source-library-native-sync',
      isReplacementRequestCurrent,
    });
    // The successful reset is main's canonical blank project, not a user-created unsaved Paper
    // publication. Keep only this startup baseline clean so a queued OS open can immediately run
    // its own replacement decision. File > New and createNewDocument retain their dirty semantics.
    if (replaced) usePaperStore.getState().markAllDocumentsProjectSaved();
    return replaced ? 'blank-project' : stale ? 'stale-startup' : 'preserved-live-work';
  } catch (error) {
    if (stale) return 'stale-startup';
    throw error;
  }
}
