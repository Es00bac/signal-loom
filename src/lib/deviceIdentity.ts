import { isAndroidLanServerAvailable } from './androidLanServer';
import { EDIT_LOCK_HOST_DEVICE_ID, type EditLockDevice } from './projectEditLock';

/**
 * Stable per-device identity for the cross-device edit baton (memory: cross-device-sync-baton-model).
 * The baton recognises a device across reloads by this id; the label is what the *other* device shows
 * in its "Editing on …" banner.
 *
 *  - The **phone host** edits under the reserved {@link EDIT_LOCK_HOST_DEVICE_ID}, so its own UI and any
 *    served client always have distinct identities even before the client has persisted one.
 *  - A **served desktop browser** / **installed desktop app** gets a random id persisted in localStorage.
 */

const DEVICE_ID_STORAGE_KEY = 'signal-loom-device-id';

let cachedId: string | null = null;

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // fall through to the time+random fallback
  }
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Stable id for THIS device. The phone uses the reserved host id; clients persist a random one. */
export function getLocalDeviceId(): string {
  if (cachedId) return cachedId;
  if (isAndroidLanServerAvailable()) {
    cachedId = EDIT_LOCK_HOST_DEVICE_ID;
    return cachedId;
  }
  try {
    const stored = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (stored) {
      cachedId = stored;
      return stored;
    }
    const fresh = randomId();
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, fresh);
    cachedId = fresh;
    return fresh;
  } catch {
    // storage unavailable — an in-memory id still works for this session
    cachedId = randomId();
    return cachedId;
  }
}

function isElectronRuntime(): boolean {
  // @ts-expect-error injected by the Electron preload
  return typeof window !== 'undefined' && Boolean(window.electron);
}

/** Human label the other device shows for this one in the baton/read-only UI. */
export function getLocalDeviceLabel(): string {
  if (isAndroidLanServerAvailable()) return 'Phone';
  if (isElectronRuntime()) return 'Desktop app';
  return 'Desktop browser';
}

/** This device's identity for the edit baton. */
export function getLocalDevice(): EditLockDevice {
  return { id: getLocalDeviceId(), label: getLocalDeviceLabel() };
}
