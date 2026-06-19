import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Bridge to the native SignalLoomLanServer plugin, which serves the bundled web app over the local
 * network so a desktop browser on the same Wi-Fi can open the full Signal Loom interface from the
 * phone. The served app runs in plain web mode (no Capacitor bridge), like the Chrome build.
 */
export interface SignalLoomLanServerStatus {
  running: boolean;
  port: number;
  ip: string;
  url: string | null;
}

export interface SignalLoomLanServerPlugin {
  start(options: { port?: number }): Promise<SignalLoomLanServerStatus>;
  stop(): Promise<SignalLoomLanServerStatus>;
  status(): Promise<SignalLoomLanServerStatus>;
}

/** Default port the phone serves the desktop app on. */
export const SIGNAL_LOOM_LAN_SERVER_DEFAULT_PORT = 8723;

const SIGNAL_LOOM_LAN_SERVER_PLUGIN_KEY = '__signalLoomLanServerPlugin';

function getSignalLoomLanServerPlugin(): SignalLoomLanServerPlugin {
  const globalState = globalThis as typeof globalThis & {
    [SIGNAL_LOOM_LAN_SERVER_PLUGIN_KEY]?: SignalLoomLanServerPlugin;
  };
  const cachedPlugin = globalState[SIGNAL_LOOM_LAN_SERVER_PLUGIN_KEY];
  if (cachedPlugin) {
    return cachedPlugin;
  }
  const plugin = registerPlugin<SignalLoomLanServerPlugin>('SignalLoomLanServer');
  globalState[SIGNAL_LOOM_LAN_SERVER_PLUGIN_KEY] = plugin;
  return plugin;
}

/** True only in the native Android app, where the embedded LAN server exists. */
export function isAndroidLanServerAvailable(): boolean {
  return Capacitor.getPlatform() === 'android';
}

/** Start serving the app on the LAN; resolves with the URL a desktop browser should open. */
export async function startAndroidLanServer(
  port = SIGNAL_LOOM_LAN_SERVER_DEFAULT_PORT,
): Promise<SignalLoomLanServerStatus | null> {
  if (!isAndroidLanServerAvailable()) return null;
  try {
    return await getSignalLoomLanServerPlugin().start({ port });
  } catch {
    return null;
  }
}

/** Stop serving the app on the LAN. */
export async function stopAndroidLanServer(): Promise<SignalLoomLanServerStatus | null> {
  if (!isAndroidLanServerAvailable()) return null;
  try {
    return await getSignalLoomLanServerPlugin().stop();
  } catch {
    return null;
  }
}

/** Current LAN-server state (running / url / ip / port), or null when unavailable. */
export async function getAndroidLanServerStatus(): Promise<SignalLoomLanServerStatus | null> {
  if (!isAndroidLanServerAvailable()) return null;
  try {
    return await getSignalLoomLanServerPlugin().status();
  } catch {
    return null;
  }
}
