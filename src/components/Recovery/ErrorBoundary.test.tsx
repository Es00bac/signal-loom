import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { formatErrorDetails } from '../../lib/errorRecoveryDetails';
import { RecoveryFallback } from './ErrorBoundary';

describe('RecoveryFallback', () => {
  it('renders dark recovery actions for a caught render error', () => {
    const html = renderToStaticMarkup(
      <RecoveryFallback
        error={new Error('canvas exploded')}
        level="canvas"
        onClearPersistedState={vi.fn()}
        onCopyDetails={vi.fn()}
        onReloadApp={vi.fn()}
        onResetBoundary={vi.fn()}
        onResetLayout={vi.fn()}
        onResetProject={vi.fn()}
        title="Flow Canvas"
      />,
    );

    expect(html).toContain('Recovery Boundary');
    expect(html).toContain('Flow Canvas');
    expect(html).toContain('canvas exploded');
    expect(html).toContain('Reload App');
    expect(html).toContain('Reset Blank Project');
    expect(html).toContain('Clear Recoverable State');
    expect(html).toContain('Provider and API keys are preserved');
  });

  it('formats error details with stack and component stack', () => {
    const error = new Error('panel failed');
    error.stack = 'Error: panel failed\n    at Panel';

    expect(formatErrorDetails(error, { componentStack: '\n    at DockablePanel' }, 'Source Bin')).toContain(
      'Surface: Source Bin',
    );
    expect(formatErrorDetails(error, { componentStack: '\n    at DockablePanel' }, 'Source Bin')).toContain(
      'Component stack:',
    );
  });
});
