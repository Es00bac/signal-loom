import { describe, expect, it } from 'vitest';
import { getVertexProjectConfig } from './vertexProviderSettings';
import { DEFAULT_PROVIDER_SETTINGS } from './providerCatalog';

describe('vertexProviderSettings', () => {
  it('falls back to persisted Vertex environment variables for project, location, and quota project', () => {
    expect(getVertexProjectConfig({
      ...DEFAULT_PROVIDER_SETTINGS,
      geminiCredentialMode: 'vertex-adc',
      vertexProjectId: '',
      vertexLocation: '',
      vertexEnvironmentVariables: [
        'export GOOGLE_CLOUD_PROJECT="signal-loom-prod"',
        'GOOGLE_CLOUD_LOCATION=us-central1',
        'GOOGLE_CLOUD_QUOTA_PROJECT=signal-loom-billing',
      ].join('\n'),
    })).toEqual({
      projectId: 'signal-loom-prod',
      location: 'us-central1',
      auth: {
        mode: 'gcloud-adc',
        quotaProjectId: 'signal-loom-billing',
        environmentVariables: [
          'export GOOGLE_CLOUD_PROJECT="signal-loom-prod"',
          'GOOGLE_CLOUD_LOCATION=us-central1',
          'GOOGLE_CLOUD_QUOTA_PROJECT=signal-loom-billing',
        ].join('\n'),
      },
    });
  });

  it('supports legacy CLOUDSDK_* env keys as project and location fallbacks', () => {
    expect(getVertexProjectConfig({
      ...DEFAULT_PROVIDER_SETTINGS,
      geminiCredentialMode: 'vertex-adc',
      vertexProjectId: '',
      vertexLocation: '',
      vertexEnvironmentVariables: [
        'CLOUDSDK_CORE_PROJECT=signal-loom-prod',
        'CLOUDSDK_COMPUTE_REGION=us-east1',
      ].join('\n'),
    })).toEqual({
      projectId: 'signal-loom-prod',
      location: 'us-east1',
      auth: {
        mode: 'gcloud-adc',
        environmentVariables: [
          'CLOUDSDK_CORE_PROJECT=signal-loom-prod',
          'CLOUDSDK_COMPUTE_REGION=us-east1',
        ].join('\n'),
      },
    });
  });
});
