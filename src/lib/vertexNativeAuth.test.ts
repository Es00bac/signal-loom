import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { basename } from 'node:path';

interface VertexAuthModule {
  buildVertexAccessTokenCommand: (auth?: { mode?: string; environmentVariables?: string }) => { command: string; args: string[] };
  buildVertexAuthEnvironment: (auth: { environmentVariables?: string }, baseEnv: NodeJS.ProcessEnv) => NodeJS.ProcessEnv;
  parseVertexEnvironmentVariables: (value?: string) => Record<string, string>;
  buildVertexLoginCommand: (auth?: { mode?: string; environmentVariables?: string }) => { command: string; args: string[] };
  buildVertexListProjectsCommand: (auth?: { environmentVariables?: string }) => { command: string; args: string[] };
  parseGcloudProjectsList: (stdout?: string) => Array<{ projectId: string; name: string }>;
}

async function loadVertexAuthModule(): Promise<VertexAuthModule> {
  // @ts-expect-error CommonJS Electron helper lives outside the renderer tsconfig module graph.
  return await import('../../electron/vertex-auth.cjs') as VertexAuthModule;
}

describe('Electron Vertex native auth helpers', () => {
  let oldGcloud: string | undefined;
  let oldCloudsdk: string | undefined;
  let oldGoogleCloud: string | undefined;

  beforeEach(() => {
    oldGcloud = process.env.GCLOUD_ACCOUNT;
    oldCloudsdk = process.env.CLOUDSDK_ACCOUNT;
    oldGoogleCloud = process.env.GOOGLE_CLOUD_ACCOUNT;
    delete process.env.GCLOUD_ACCOUNT;
    delete process.env.CLOUDSDK_ACCOUNT;
    delete process.env.GOOGLE_CLOUD_ACCOUNT;
  });

  afterEach(() => {
    if (oldGcloud !== undefined) process.env.GCLOUD_ACCOUNT = oldGcloud;
    if (oldCloudsdk !== undefined) process.env.CLOUDSDK_ACCOUNT = oldCloudsdk;
    if (oldGoogleCloud !== undefined) process.env.GOOGLE_CLOUD_ACCOUNT = oldGoogleCloud;
  });

  it('uses user gcloud credentials by default and supports ADC mode without shell execution', async () => {
    const { buildVertexAccessTokenCommand } = await loadVertexAuthModule();

    expect(buildVertexAccessTokenCommand()).toMatchObject({
      args: ['auth', 'print-access-token'],
    });
    expect(basename(buildVertexAccessTokenCommand().command)).toBe('gcloud');
    expect(buildVertexAccessTokenCommand({ mode: 'gcloud-adc' })).toMatchObject({
      args: ['auth', 'application-default', 'print-access-token'],
    });
    expect(basename(buildVertexAccessTokenCommand({ mode: 'gcloud-adc' }).command)).toBe('gcloud');
  });

  it('parses persisted Vertex environment variables into the token command environment', async () => {
    const { buildVertexAuthEnvironment, parseVertexEnvironmentVariables } = await loadVertexAuthModule();

    expect(parseVertexEnvironmentVariables(`
      # local ADC profile
      GOOGLE_APPLICATION_CREDENTIALS=/secure/vertex.json
      CLOUDSDK_CORE_PROJECT=signal-loom-prod
      invalid-key=ignored
    `)).toEqual({
      GOOGLE_APPLICATION_CREDENTIALS: '/secure/vertex.json',
      CLOUDSDK_CORE_PROJECT: 'signal-loom-prod',
    });

    expect(buildVertexAuthEnvironment({
      environmentVariables: 'GOOGLE_APPLICATION_CREDENTIALS=/secure/vertex.json',
    }, {
      PATH: '/usr/bin',
      GOOGLE_APPLICATION_CREDENTIALS: '/old.json',
    })).toMatchObject({
      PATH: '/usr/bin',
      GOOGLE_APPLICATION_CREDENTIALS: '/secure/vertex.json',
    });
  });

  it('supports quoted and export-style environment lines', async () => {
    const { parseVertexEnvironmentVariables, buildVertexAccessTokenCommand } = await loadVertexAuthModule();

    expect(parseVertexEnvironmentVariables(
      'export GCLOUD_BIN="/tmp/vertex-gcloud"\nexport GOOGLE_CLOUD_PROJECT="quoted-project"',
    )).toMatchObject({
      GCLOUD_BIN: '/tmp/vertex-gcloud',
      GOOGLE_CLOUD_PROJECT: 'quoted-project',
    });

    if (process.platform === 'win32') {
      expect(buildVertexAccessTokenCommand({
        mode: 'gcloud-adc',
        environmentVariables: 'export GCLOUD_BIN="C:/Windows/System32/cmd.exe"',
      }).command).toBe('C:/Windows/System32/cmd.exe');
      return;
    }

    expect(buildVertexAccessTokenCommand({
      environmentVariables: 'export GCLOUD_BIN="/bin/true"',
    }).command).toBe('/bin/true');
  });

  it('adds a user account override when GCLOUD_ACCOUNT is present', async () => {
    const { buildVertexAccessTokenCommand } = await loadVertexAuthModule();

    expect(buildVertexAccessTokenCommand({
      mode: 'gcloud-user',
      environmentVariables: 'export GCLOUD_ACCOUNT="jgoogly02@gmail.com"',
    }).args).toEqual(['auth', 'print-access-token', '--account', 'jgoogly02@gmail.com']);
  });

  it('builds login and project-list commands and parses project output', async () => {
    const mod = await loadVertexAuthModule();

    expect(mod.buildVertexLoginCommand({ mode: 'gcloud-adc' })).toMatchObject({
      args: ['auth', 'application-default', 'login'],
    });
    expect(mod.buildVertexLoginCommand({ mode: 'gcloud-user' })).toMatchObject({
      args: ['auth', 'login'],
    });
    expect(mod.buildVertexLoginCommand({
      mode: 'gcloud-user',
      environmentVariables: 'GCLOUD_ACCOUNT=me@example.com',
    })).toMatchObject({
      args: ['auth', 'login', '--account', 'me@example.com'],
    });

    expect(mod.buildVertexListProjectsCommand()).toMatchObject({
      args: ['projects', 'list', '--format=json'],
    });

    expect(mod.parseGcloudProjectsList(JSON.stringify([
      { projectId: 'p1', name: 'One' },
      { projectId: 'p2', name: 'Two' },
      { name: 'missing-id' },
    ]))).toEqual([
      { projectId: 'p1', name: 'One' },
      { projectId: 'p2', name: 'Two' },
    ]);
    expect(mod.parseGcloudProjectsList('not json')).toEqual([]);
  });
});
