import { useCallback, useMemo, useState } from 'react';
import type { ProviderSettings } from '../../types/flow';
import { getSignalLoomNativeBridge } from '../../lib/nativeApp';
import { buildNativeVertexAuthConfig } from '../../lib/vertexProviderSettings';
import { computeVertexAuthStatus } from '../../lib/vertex/vertexAuthStatus';
import { parseServiceAccountJson, getServiceAccountAccessToken } from '../../lib/vertex/vertexServiceAccountAuth';

interface UseVertexAuthArgs {
  providerSettings: ProviderSettings;
  setProviderSetting: <TKey extends keyof ProviderSettings>(key: TKey, value: ProviderSettings[TKey]) => void;
  platform: 'desktop' | 'mobile';
}

export function useVertexAuth({ providerSettings, setProviderSetting, platform }: UseVertexAuthArgs) {
  const [projects, setProjects] = useState<Array<{ projectId: string; name: string }>>([]);
  const [busy, setBusy] = useState<{ login?: boolean; detect?: boolean; projects?: boolean; test?: boolean }>({});
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [serviceAccountError, setServiceAccountError] = useState<string | undefined>(undefined);

  const status = useMemo(
    () => computeVertexAuthStatus(providerSettings, platform),
    [providerSettings, platform],
  );

  const authConfig = useMemo(() => buildNativeVertexAuthConfig(providerSettings), [providerSettings]);

  const refreshProjects = useCallback(async () => {
    const bridge = getSignalLoomNativeBridge();
    if (!bridge?.listVertexProjects) return;
    setBusy((prev) => ({ ...prev, projects: true }));
    try {
      const result = await bridge.listVertexProjects({ auth: authConfig });
      setProjects(result.ok ? result.projects : []);
      if (!result.ok && result.error) {
        setTestResult({ ok: false, message: result.error });
      }
    } finally {
      setBusy((prev) => ({ ...prev, projects: false }));
    }
  }, [authConfig]);

  const signIn = useCallback(async () => {
    const bridge = getSignalLoomNativeBridge();
    if (!bridge?.loginVertex) return;
    setBusy((prev) => ({ ...prev, login: true }));
    try {
      const result = await bridge.loginVertex({ auth: authConfig });
      setTestResult(result.ok
        ? { ok: true, message: 'Signed in. Detecting credentials…' }
        : { ok: false, message: result.error ?? 'Sign-in failed.' });
      if (result.ok) {
        await refreshProjects();
      }
    } finally {
      setBusy((prev) => ({ ...prev, login: false }));
    }
  }, [authConfig, refreshProjects]);

  const detect = useCallback(async () => {
    const bridge = getSignalLoomNativeBridge();
    if (!bridge?.detectVertexAdc) return;
    setBusy((prev) => ({ ...prev, detect: true }));
    try {
      const result = await bridge.detectVertexAdc({ auth: authConfig });
      setTestResult(result.ok && result.hasToken
        ? { ok: true, message: 'Credentials detected.' }
        : { ok: false, message: result.error ?? 'No usable credentials found.' });
    } finally {
      setBusy((prev) => ({ ...prev, detect: false }));
    }
  }, [authConfig]);

  const testConnection = useCallback(async () => {
    setBusy((prev) => ({ ...prev, test: true }));
    setTestResult(null);
    try {
      if (platform === 'desktop') {
        await detect();
        return;
      }
      const minted = await getServiceAccountAccessToken(providerSettings.vertexServiceAccountJson);
      const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(minted.accessToken)}`);
      setTestResult(response.ok
        ? { ok: true, message: 'Service-account credentials verified.' }
        : { ok: false, message: `Token rejected (${response.status}).` });
    } catch (error) {
      setTestResult({ ok: false, message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy((prev) => ({ ...prev, test: false }));
    }
  }, [platform, detect, providerSettings.vertexServiceAccountJson]);

  const importServiceAccountText = useCallback((raw: string) => {
    setProviderSetting('vertexServiceAccountJson', raw);
    const parsed = parseServiceAccountJson(raw);
    if (!parsed.ok) {
      setServiceAccountError(parsed.error);
      return;
    }
    setServiceAccountError(undefined);
    if (parsed.credential && !providerSettings.vertexProjectId.trim()) {
      setProviderSetting('vertexProjectId', parsed.credential.projectId);
    }
  }, [setProviderSetting, providerSettings.vertexProjectId]);

  const onServiceAccountFile = useCallback(async (file: File) => {
    const text = await file.text();
    importServiceAccountText(text);
  }, [importServiceAccountText]);

  return {
    status,
    projects,
    busy,
    testResult,
    serviceAccountError,
    onSignIn: signIn,
    onDetect: detect,
    onRefreshProjects: refreshProjects,
    onTestConnection: testConnection,
    onServiceAccountFile,
    onServiceAccountText: importServiceAccountText,
  };
}
