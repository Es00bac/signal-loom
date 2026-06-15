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
