import { describe, expect, it } from 'vitest';
import { parseServiceAccountJson } from './vertexServiceAccountAuth';

const VALID = JSON.stringify({
  type: 'service_account',
  project_id: 'proj-1',
  client_email: 'svc@proj-1.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----\n',
  token_uri: 'https://oauth2.googleapis.com/token',
});

describe('parseServiceAccountJson', () => {
  it('parses a valid service-account key', () => {
    const result = parseServiceAccountJson(VALID);
    expect(result.ok).toBe(true);
    expect(result.credential).toMatchObject({
      clientEmail: 'svc@proj-1.iam.gserviceaccount.com',
      projectId: 'proj-1',
      tokenUri: 'https://oauth2.googleapis.com/token',
    });
  });

  it('defaults token_uri when absent', () => {
    const raw = JSON.parse(VALID);
    delete raw.token_uri;
    const result = parseServiceAccountJson(JSON.stringify(raw));
    expect(result.ok).toBe(true);
    expect(result.credential?.tokenUri).toBe('https://oauth2.googleapis.com/token');
  });

  it('rejects invalid JSON', () => {
    const result = parseServiceAccountJson('{ not json');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/parse|json/i);
  });

  it('rejects a non-service-account type', () => {
    const raw = JSON.parse(VALID);
    raw.type = 'authorized_user';
    const result = parseServiceAccountJson(JSON.stringify(raw));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/service_account/);
  });

  it('rejects when client_email is missing', () => {
    const raw = JSON.parse(VALID);
    delete raw.client_email;
    const result = parseServiceAccountJson(JSON.stringify(raw));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/client_email/);
  });

  it('rejects when private_key is not a PEM key', () => {
    const raw = JSON.parse(VALID);
    raw.private_key = 'nope';
    const result = parseServiceAccountJson(JSON.stringify(raw));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/private_key/);
  });

  it('rejects when project_id is missing', () => {
    const raw = JSON.parse(VALID);
    delete raw.project_id;
    const result = parseServiceAccountJson(JSON.stringify(raw));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/project_id/);
  });
});
