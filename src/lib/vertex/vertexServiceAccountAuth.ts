export interface VertexServiceAccountCredential {
  clientEmail: string;
  privateKey: string;
  projectId: string;
  tokenUri: string;
}

export interface ParseServiceAccountResult {
  ok: boolean;
  credential?: VertexServiceAccountCredential;
  error?: string;
}

const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';

export function parseServiceAccountJson(raw: string): ParseServiceAccountResult {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { ok: false, error: 'Could not parse service-account JSON. Paste the full key file contents.' };
  }

  if (data.type !== 'service_account') {
    return { ok: false, error: 'Expected a service_account key (the "type" field must be "service_account").' };
  }

  const clientEmail = typeof data.client_email === 'string' ? data.client_email.trim() : '';
  if (!clientEmail) {
    return { ok: false, error: 'Service-account key is missing client_email.' };
  }

  const privateKey = typeof data.private_key === 'string' ? data.private_key : '';
  if (!privateKey.includes('PRIVATE KEY')) {
    return { ok: false, error: 'Service-account key is missing a valid private_key (PEM).' };
  }

  const projectId = typeof data.project_id === 'string' ? data.project_id.trim() : '';
  if (!projectId) {
    return { ok: false, error: 'Service-account key is missing project_id.' };
  }

  const tokenUri = typeof data.token_uri === 'string' && data.token_uri.trim()
    ? data.token_uri.trim()
    : DEFAULT_TOKEN_URI;

  return { ok: true, credential: { clientEmail, privateKey, projectId, tokenUri } };
}

const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const TOKEN_LIFETIME_SECONDS = 3600;
const REFRESH_SKEW_MS = 60_000;

export interface MintedAccessToken {
  accessToken: string;
  expiresAt: number;
}

export interface MintAccessTokenDeps {
  subtle?: SubtleCrypto;
  fetch?: typeof fetch;
  now?: () => number;
}

function base64UrlFromString(value: string): string {
  return base64UrlFromBytes(new TextEncoder().encode(value));
}

function base64UrlFromBytes(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function mintAccessToken(
  credential: VertexServiceAccountCredential,
  deps: MintAccessTokenDeps = {},
): Promise<MintedAccessToken> {
  const subtle = deps.subtle ?? globalThis.crypto?.subtle;
  const doFetch = deps.fetch ?? globalThis.fetch;
  const now = deps.now ?? Date.now;
  if (!subtle) {
    throw new Error('WebCrypto SubtleCrypto is unavailable in this runtime.');
  }

  const issuedAt = Math.floor(now() / 1000);
  const header = base64UrlFromString(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64UrlFromString(JSON.stringify({
    iss: credential.clientEmail,
    sub: credential.clientEmail,
    scope: SCOPE,
    aud: credential.tokenUri,
    iat: issuedAt,
    exp: issuedAt + TOKEN_LIFETIME_SECONDS,
  }));
  const signingInput = `${header}.${claims}`;

  const key = await subtle.importKey(
    'pkcs8',
    pemToPkcs8(credential.privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  const assertion = `${signingInput}.${base64UrlFromBytes(signature)}`;

  const response = await doFetch(credential.tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Vertex token exchange failed (${response.status}). ${detail}`.trim());
  }

  const payload = await response.json() as { access_token?: string; expires_in?: number };
  if (!payload.access_token) {
    throw new Error('Vertex token exchange returned no access_token.');
  }

  const lifetimeSeconds = typeof payload.expires_in === 'number' ? payload.expires_in : TOKEN_LIFETIME_SECONDS;
  return { accessToken: payload.access_token, expiresAt: now() + lifetimeSeconds * 1000 };
}

const tokenCache = new Map<string, MintedAccessToken>();

export function clearVertexTokenCache(): void {
  tokenCache.clear();
}

export async function getServiceAccountAccessToken(
  raw: string,
  deps: MintAccessTokenDeps = {},
): Promise<MintedAccessToken> {
  const parsed = parseServiceAccountJson(raw);
  if (!parsed.ok || !parsed.credential) {
    throw new Error(parsed.error ?? 'Invalid service-account JSON.');
  }

  const now = deps.now ?? Date.now;
  const cacheKey = parsed.credential.clientEmail;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt - REFRESH_SKEW_MS > now()) {
    return cached;
  }

  const minted = await mintAccessToken(parsed.credential, deps);
  tokenCache.set(cacheKey, minted);
  return minted;
}
