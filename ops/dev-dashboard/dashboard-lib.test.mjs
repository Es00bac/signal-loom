import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DASHBOARD_PORT,
  buildDashboardModel,
  renderDashboardHtml,
} from './dashboard-lib.mjs';

describe('dev dashboard model', () => {
  it('collects Android launch splash artifact telemetry for Verification Telemetry', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'signal-loom-dashboard-launch-splash-'));
    mkdirSync(join(rootDir, 'docs', 'notes'), { recursive: true });
    mkdirSync(join(rootDir, 'ops', 'dev-dashboard', 'artifacts'), { recursive: true });
    writeFileSync(join(rootDir, 'docs', 'TASK_LIST.md'), '# Tasks\n\n## Current Status\n');
    writeFileSync(
      join(rootDir, 'ops', 'dev-dashboard', 'artifacts', 'android-launch-splash-latest.json'),
      JSON.stringify({
        kind: 'android-launch-splash',
        ok: true,
        timestamp: '2026-06-13T19:25:54Z',
        device: {
          serial: 'R3GL40ABQXM',
          model: 'SM_S948U',
        },
        app: {
          packageName: 'studio.sloom.signalloom',
          activity: 'studio.sloom.signalloom/.MainActivity',
          installed: true,
          pid: 22014,
          focused: true,
        },
        launch: {
          state: 'COLD',
          totalTimeMs: 278,
          waitTimeMs: 286,
        },
        display: {
          logicalId: 34,
          surfaceFlingerDisplayId: '11529215049443834093',
          width: 2560,
          height: 1440,
          densityDpi: 160,
        },
        splash: {
          sourceImage: 'public/signal-loom-splash.png',
          nativeTheme: true,
          bootOverlay: true,
          screenshotCaptured: true,
          screenshotPath: 'ops/dev-dashboard/artifacts/android-dex-signal-loom-boot-splash-latest.png',
          screenshotResolution: '2560x1440',
        },
      }),
    );

    const model = buildDashboardModel({ rootDir });
    const html = renderDashboardHtml(model);

    expect(model.telemetry.androidLaunchSplash).toMatchObject({
      available: true,
      ok: true,
      path: 'ops/dev-dashboard/artifacts/android-launch-splash-latest.json',
      device: 'SM_S948U',
      packageName: 'studio.sloom.signalloom',
      focused: true,
      launchState: 'COLD',
      totalTimeMs: 278,
      display: {
        id: 34,
        width: 2560,
        height: 1440,
        densityDpi: 160,
      },
      splash: {
        nativeTheme: true,
        bootOverlay: true,
        screenshotCaptured: true,
        screenshotResolution: '2560x1440',
      },
    });
    expect(html).toContain('Android launch splash: PASS ops/dev-dashboard/artifacts/android-launch-splash-latest.json');
    expect(html).toContain('launch: COLD');
    expect(html).toContain('launch ms: 278');
    expect(html).toContain('display: 2560x1440');
    expect(html).toContain('boot overlay: true');
    expect(html).toContain('screenshot: 2560x1440');
  });

  it('preserves failed Android launch splash artifact status instead of marking parsed JSON as passed', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'signal-loom-dashboard-launch-splash-failed-'));
    mkdirSync(join(rootDir, 'docs', 'notes'), { recursive: true });
    mkdirSync(join(rootDir, 'ops', 'dev-dashboard', 'artifacts'), { recursive: true });
    writeFileSync(join(rootDir, 'docs', 'TASK_LIST.md'), '# Tasks\n\n## Current Status\n');
    writeFileSync(
      join(rootDir, 'ops', 'dev-dashboard', 'artifacts', 'android-launch-splash-latest.json'),
      JSON.stringify({
        kind: 'android-launch-splash',
        ok: false,
        timestamp: '2026-06-13T20:46:07Z',
        device: {
          serial: 'R3GL40ABQXM',
          model: 'SM_S948U',
        },
        app: {
          packageName: 'studio.sloom.signalloom',
          activity: 'studio.sloom.signalloom/.MainActivity',
          installed: true,
          pid: 30977,
          focused: false,
        },
        launch: {
          state: 'COLD',
          totalTimeMs: 305,
          waitTimeMs: 307,
        },
        display: {
          logicalId: 34,
          surfaceFlingerDisplayId: '11529215049443834093',
          width: 2560,
          height: 1440,
          densityDpi: 160,
        },
        splash: {
          sourceImage: 'public/signal-loom-splash.png',
          nativeTheme: true,
          bootOverlay: true,
          screenshotCaptured: true,
          screenshotResolution: '2560x1440',
        },
        caveats: ['Device is locked.'],
      }),
    );

    const model = buildDashboardModel({ rootDir });
    const html = renderDashboardHtml(model);

    expect(model.telemetry.androidLaunchSplash).toMatchObject({
      available: true,
      ok: false,
      focused: false,
      launchState: 'COLD',
      totalTimeMs: 305,
    });
    expect(html).toContain('Android launch splash: FAIL ops/dev-dashboard/artifacts/android-launch-splash-latest.json');
    expect(html).toContain('focused: false');
  });

  it('collects Android Dex Image workspace artifact telemetry for Verification Telemetry', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'signal-loom-dashboard-dex-workspace-'));
    mkdirSync(join(rootDir, 'docs', 'notes'), { recursive: true });
    mkdirSync(join(rootDir, 'ops', 'dev-dashboard', 'artifacts'), { recursive: true });
    writeFileSync(join(rootDir, 'docs', 'TASK_LIST.md'), '# Tasks\n\n## Current Status\n');
    writeFileSync(
      join(rootDir, 'ops', 'dev-dashboard', 'artifacts', 'android-dex-image-workspace-latest.json'),
      JSON.stringify({
        generatedAt: '2026-06-13T03:12:31.167Z',
        lane: 'Android Dex 4K Image workspace evidence',
        findings: {
          targetDisplayId: 9,
          packageName: 'studio.sloom.signalloom',
          activity: 'studio.sloom.signalloom.MainActivity',
          signalLoomAssociatedWithDisplay9Heuristic: true,
          focusMentionsSignalLoom: true,
          screenshotCaptured: true,
          screenshotPath: join(
            rootDir,
            'ops',
            'dev-dashboard',
            'artifacts',
            'android-dex-image-workspace-latest.png',
          ),
          screenshotResolution: '3840x2160',
          imageWorkspaceEvidence: true,
          visualScreenshotInspection: {
            inspectedByAgent: true,
            summary: 'Dex screenshot shows Signal Loom open on the Image workspace.',
          },
          readinessAssessment: 'strong-for-workspace-presence',
          shouldMoveAndroidDexReadiness: true,
        },
      }),
    );

    const model = buildDashboardModel({ rootDir });
    const html = renderDashboardHtml(model);

    expect(model.telemetry.androidDexImageWorkspace).toMatchObject({
      available: true,
      ok: true,
      path: 'ops/dev-dashboard/artifacts/android-dex-image-workspace-latest.json',
      display: {
        id: 9,
        signalLoomAssociated: true,
        focused: true,
      },
      workspace: {
        packageName: 'studio.sloom.signalloom',
        activity: 'studio.sloom.signalloom.MainActivity',
        imageWorkspaceEvidence: true,
      },
      screenshot: {
        captured: true,
        path: 'ops/dev-dashboard/artifacts/android-dex-image-workspace-latest.png',
        resolution: '3840x2160',
        inspected: true,
        summary: 'Dex screenshot shows Signal Loom open on the Image workspace.',
      },
      readiness: {
        assessment: 'strong-for-workspace-presence',
        shouldMoveAndroidDexReadiness: true,
      },
    });
    expect(html).toContain('Verification Telemetry');
    expect(html).toContain('Android Dex Image workspace: PASS ops/dev-dashboard/artifacts/android-dex-image-workspace-latest.json');
    expect(html).toContain('display: 9');
    expect(html).toContain('workspace: present');
    expect(html).toContain('screenshot: 3840x2160');
    expect(html).toContain('readiness: move');
  });

  it('collects Android Dex 1080p restart artifact telemetry for Verification Telemetry', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'signal-loom-dashboard-dex-1080p-'));
    mkdirSync(join(rootDir, 'docs', 'notes'), { recursive: true });
    mkdirSync(join(rootDir, 'ops', 'dev-dashboard', 'artifacts'), { recursive: true });
    writeFileSync(join(rootDir, 'docs', 'TASK_LIST.md'), '# Tasks\n\n## Current Status\n');
    writeFileSync(
      join(rootDir, 'ops', 'dev-dashboard', 'artifacts', 'android-dex-1080p-restart-latest.json'),
      JSON.stringify({
        kind: 'android-dex-1080p-restart',
        timestamp: '2026-06-12T21:41:08-06:00',
        deviceModel: 'SM_S948U',
        packageName: 'studio.sloom.signalloom',
        activity: 'studio.sloom.signalloom.MainActivity',
        restart: {
          forceStoppedPackage: true,
          normalLaunchUsed: true,
          directLaunchDisplayAttempt: {
            displayId: 11,
            ok: false,
          },
        },
        display: {
          id: 12,
          surfaceFlingerDisplayId: '11529215049543458039',
          name: 'Overlay #1',
          type: 'OVERLAY',
          width: 1920,
          height: 1080,
          densityDpi: 320,
          primaryInDisplayTopology: true,
          dexTaskbarVisible: true,
          focusedSignalLoomWindow: true,
        },
        workspace: {
          activeWorkspace: 'Image',
          imageWorkspaceEvidence: true,
          documentState: 'no-document-open',
        },
        screenshot: {
          captured: true,
          path: 'ops/dev-dashboard/artifacts/android-dex-1080p-restart-latest.png',
          resolution: '1920x1080',
          visualAssessment: 'Image workspace is visible at 1080p.',
        },
      }),
    );

    const model = buildDashboardModel({ rootDir });
    const html = renderDashboardHtml(model);

    expect(model.telemetry.androidDex1080pRestart).toMatchObject({
      available: true,
      ok: true,
      path: 'ops/dev-dashboard/artifacts/android-dex-1080p-restart-latest.json',
      device: 'SM_S948U',
      display: {
        id: 12,
        type: 'OVERLAY',
        width: 1920,
        height: 1080,
        densityDpi: 320,
        dexTaskbarVisible: true,
        focusedSignalLoomWindow: true,
      },
      workspace: {
        activeWorkspace: 'Image',
        imageWorkspaceEvidence: true,
        documentState: 'no-document-open',
      },
      screenshot: {
        captured: true,
        path: 'ops/dev-dashboard/artifacts/android-dex-1080p-restart-latest.png',
        resolution: '1920x1080',
      },
      restart: {
        forceStoppedPackage: true,
        normalLaunchUsed: true,
        directLaunchDisplayDenied: true,
      },
    });
    expect(html).toContain('Android Dex 1080p restart: PASS ops/dev-dashboard/artifacts/android-dex-1080p-restart-latest.json');
    expect(html).toContain('display: 1920x1080');
    expect(html).toContain('workspace: present');
    expect(html).toContain('document: no-document-open');
  });

  it('collects Android Dex 1080p open-document artifact telemetry for Verification Telemetry', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'signal-loom-dashboard-dex-open-doc-'));
    mkdirSync(join(rootDir, 'docs', 'notes'), { recursive: true });
    mkdirSync(join(rootDir, 'ops', 'dev-dashboard', 'artifacts'), { recursive: true });
    writeFileSync(join(rootDir, 'docs', 'TASK_LIST.md'), '# Tasks\n\n## Current Status\n');
    writeFileSync(
      join(rootDir, 'ops', 'dev-dashboard', 'artifacts', 'android-dex-1080p-open-document-latest.json'),
      JSON.stringify({
        kind: 'android-dex-1080p-open-document',
        timestamp: '2026-06-12T21:50:00-06:00',
        deviceModel: 'SM_S948U',
        packageName: 'studio.sloom.signalloom',
        activity: 'studio.sloom.signalloom.MainActivity',
        display: {
          id: 12,
          surfaceFlingerDisplayId: '11529215049543458039',
          width: 1920,
          height: 1080,
          densityDpi: 320,
          focusedSignalLoomWindow: true,
        },
        workspace: {
          activeWorkspace: 'Image',
          imageWorkspaceEvidence: true,
          documentState: 'blank-document-open',
          documentTitle: 'Untitled-1',
          documentSize: '800 x 600',
        },
        screenshot: {
          captured: true,
          path: 'ops/dev-dashboard/artifacts/android-dex-1080p-open-document-latest.png',
          resolution: '1920x1080',
        },
        caveats: ['Blank document only.'],
      }),
    );

    const model = buildDashboardModel({ rootDir });
    const html = renderDashboardHtml(model);

    expect(model.telemetry.androidDex1080pOpenDocument).toMatchObject({
      available: true,
      ok: true,
      path: 'ops/dev-dashboard/artifacts/android-dex-1080p-open-document-latest.json',
      device: 'SM_S948U',
      display: {
        id: 12,
        width: 1920,
        height: 1080,
        densityDpi: 320,
        focusedSignalLoomWindow: true,
      },
      workspace: {
        activeWorkspace: 'Image',
        imageWorkspaceEvidence: true,
        documentState: 'blank-document-open',
        documentTitle: 'Untitled-1',
        documentSize: '800 x 600',
      },
      screenshot: {
        captured: true,
        path: 'ops/dev-dashboard/artifacts/android-dex-1080p-open-document-latest.png',
        resolution: '1920x1080',
      },
      caveatCount: 1,
    });
    expect(html).toContain('Android Dex 1080p open document: PASS ops/dev-dashboard/artifacts/android-dex-1080p-open-document-latest.json');
    expect(html).toContain('display: 1920x1080');
    expect(html).toContain('document: blank-document-open');
    expect(html).toContain('title: Untitled-1');
  });

  it('collects current Android Dex 1080p open-document schema telemetry for Verification Telemetry', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'signal-loom-dashboard-dex-open-doc-current-'));
    mkdirSync(join(rootDir, 'docs', 'notes'), { recursive: true });
    mkdirSync(join(rootDir, 'ops', 'dev-dashboard', 'artifacts'), { recursive: true });
    writeFileSync(join(rootDir, 'docs', 'TASK_LIST.md'), '# Tasks\n\n## Current Status\n');
    writeFileSync(
      join(rootDir, 'ops', 'dev-dashboard', 'artifacts', 'android-dex-1080p-open-document-latest.json'),
      JSON.stringify({
        schemaVersion: 'signal-loom/android-dex-1080p-open-document/v1',
        status: 'complete_with_caveats',
        device: {
          serial: 'R3GL40ABQXM',
          model: 'SM-S948U',
          androidRelease: '16',
        },
        app: {
          package: 'studio.sloom.signalloom',
          activity: 'studio.sloom.signalloom/.MainActivity',
        },
        display: {
          originallyRequestedLogicalDisplayId: 12,
          originallyRequestedOutcome: 'Display 12 denied shell launch and later disappeared.',
          currentExternalDisplayId: 14,
          currentExternalDisplayName: '[Monitor] BatMonitor',
          currentExternalResolution: '1920x1080',
          focusedWindow: 'Window{signal-loom}',
        },
        workspaceEvidence: {
          workspace: 'Image',
          openedDocument: true,
          documentTitle: 'Untitled-1',
          documentSize: '800 x 600',
          creationToast: 'Created new canvas "Untitled-1".',
          activeLayerEvidence: 'Background layer present in Layers panel',
          createdThroughBlankCanvasDialog: true,
          visuallyPristineBlankCanvas: false,
          visualCaveat: 'Final screenshot shows black brush marks on the white canvas.',
        },
        artifacts: {
          screenshot: 'ops/dev-dashboard/artifacts/android-dex-1080p-open-document-latest.png',
          screenshotIdentifyResult: '1920x1080 PNG',
          screenshotSha256: '40204304e747f18165d00abd97aa09f36eb26520a2c91e73bbb19eae475698be',
        },
        caveats: ['Display 12 disappeared.', 'Final canvas has black brush marks.'],
      }),
    );

    const model = buildDashboardModel({ rootDir });
    const html = renderDashboardHtml(model);

    expect(model.telemetry.androidDex1080pOpenDocument).toMatchObject({
      available: true,
      ok: true,
      device: 'SM-S948U',
      serial: 'R3GL40ABQXM',
      packageName: 'studio.sloom.signalloom',
      activity: 'studio.sloom.signalloom/.MainActivity',
      display: {
        id: 14,
        name: '[Monitor] BatMonitor',
        width: 1920,
        height: 1080,
        originallyRequestedId: 12,
        originallyRequestedDenied: true,
        focusedSignalLoomWindow: true,
      },
      workspace: {
        activeWorkspace: 'Image',
        imageWorkspaceEvidence: true,
        documentState: 'blank-document-open',
        documentTitle: 'Untitled-1',
        documentSize: '800 x 600',
        activeLayerEvidence: 'Background layer present in Layers panel',
        createdThroughBlankCanvasDialog: true,
        visuallyPristineBlankCanvas: false,
      },
      screenshot: {
        captured: true,
        path: 'ops/dev-dashboard/artifacts/android-dex-1080p-open-document-latest.png',
        resolution: '1920x1080',
        sha256: '40204304e747f18165d00abd97aa09f36eb26520a2c91e73bbb19eae475698be',
      },
      caveatCount: 2,
    });
    expect(model.telemetry.androidDex1080pOpenDocumentEdit).toMatchObject({
      available: true,
      ok: true,
      path: 'ops/dev-dashboard/artifacts/android-dex-1080p-open-document-latest.json',
      device: 'SM-S948U',
      display: {
        width: 1920,
        height: 1080,
      },
      workspace: {
        activeWorkspace: 'Image',
        documentTitle: 'Untitled-1',
        documentSize: '800 x 600',
      },
      editEvidence: {
        openedDocument: true,
        activeLayerEvidence: 'Background layer present in Layers panel',
        visibleCanvasMutation: true,
        createdThroughBlankCanvasDialog: true,
        evidenceLevel: 'opened-document-edit',
        caveat: 'Final screenshot shows black brush marks on the white canvas.',
      },
      screenshot: {
        captured: true,
        resolution: '1920x1080',
      },
    });
    expect(html).toContain('Android Dex 1080p open document: PASS ops/dev-dashboard/artifacts/android-dex-1080p-open-document-latest.json');
    expect(html).toContain('Android Dex 1080p opened-document edit: PASS ops/dev-dashboard/artifacts/android-dex-1080p-open-document-latest.json');
    expect(html).toContain('display: 1920x1080');
    expect(html).toContain('document: blank-document-open');
    expect(html).toContain('edit: present');
    expect(html).toContain('title: Untitled-1');
    expect(html).toContain('caveats: 2');
  });

  it('collects latest dockable tab UI artifact telemetry for Verification Telemetry', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'signal-loom-dashboard-dockable-ui-'));
    mkdirSync(join(rootDir, 'docs', 'notes'), { recursive: true });
    mkdirSync(join(rootDir, 'ops', 'dev-dashboard', 'artifacts'), { recursive: true });
    writeFileSync(join(rootDir, 'docs', 'TASK_LIST.md'), '# Tasks\n\n## Current Status\n');
    writeFileSync(
      join(rootDir, 'ops', 'dev-dashboard', 'artifacts', 'dockable-tab-ui-20260613T035346Z.json'),
      JSON.stringify({
        schema: 'signal-loom-dockable-tab-ui-evidence/v1',
        completedAt: '2026-06-13T03:53:51.107Z',
        result: {
          fixedToolPalettesHaveNoDockButton: true,
          tabGroupsPreserveStableDimensions: true,
          screenshots: {
            '1920x1080': 'dockable-tab-ui-20260613T035346Z-1920x1080.png',
            '2560x1440': 'dockable-tab-ui-20260613T035346Z-2560x1440.png',
          },
        },
        viewports: [
          {
            viewport: { label: '1920x1080', width: 1920, height: 1080 },
            fixedToolPalette: {
              found: true,
              rect: { width: 66, height: 456 },
              hasDockButton: false,
            },
            tabGroup: {
              found: true,
              beforeRect: { width: 300, height: 220 },
              afterMoveRect: { width: 300, height: 220 },
              stableDimensions: true,
            },
          },
          {
            viewport: { label: '2560x1440', width: 2560, height: 1440 },
            fixedToolPalette: {
              found: true,
              rect: { width: 66, height: 456 },
              hasDockButton: false,
            },
            tabGroup: {
              found: true,
              beforeRect: { width: 300, height: 220 },
              afterMoveRect: { width: 300, height: 220 },
              stableDimensions: true,
            },
          },
        ],
      }),
    );

    const model = buildDashboardModel({ rootDir });
    const html = renderDashboardHtml(model);

    expect(model.telemetry.dockableTabUi).toMatchObject({
      available: true,
      ok: true,
      path: 'ops/dev-dashboard/artifacts/dockable-tab-ui-20260613T035346Z.json',
      fixedToolPalettesHaveNoDockButton: true,
      tabGroupsPreserveStableDimensions: true,
      viewportCount: 2,
      screenshotCount: 2,
      maxWidthDelta: 0,
      maxHeightDelta: 0,
      toolPaletteWidths: [66, 66],
      toolPaletteHeights: [456, 456],
    });
    expect(html).toContain('Dockable tab UI: PASS ops/dev-dashboard/artifacts/dockable-tab-ui-20260613T035346Z.json');
    expect(html).toContain('viewports: 2');
    expect(html).toContain('screenshots: 2');
    expect(html).toContain('max width delta: 0');
    expect(html).toContain('max height delta: 0');
    expect(html).toContain('no Dock button: true');
    expect(html).toContain('stable tab groups: true');
  });

  it('uses localhost port 7890 and renders task, note, and Image parity status', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'signal-loom-dashboard-'));
    mkdirSync(join(rootDir, 'docs', 'notes'), { recursive: true });
    mkdirSync(join(rootDir, 'src', 'components', 'ImageEditor'), { recursive: true });
    mkdirSync(join(rootDir, 'dist'), { recursive: true });
    mkdirSync(join(rootDir, 'android', 'app', 'src', 'main', 'assets', 'public'), { recursive: true });
    mkdirSync(join(rootDir, 'output', 'playwright', 'image-slice'), { recursive: true });
    mkdirSync(join(rootDir, 'output', 'native-real-project-soak', 'latest'), { recursive: true });
    mkdirSync(join(rootDir, 'output', 'native-paper-pdf-parity', 'latest'), { recursive: true });
    mkdirSync(join(rootDir, 'ops', 'dev-dashboard', 'artifacts'), { recursive: true });
    mkdirSync(join(rootDir, 'src', 'components', 'ImageEditor', 'tools'), { recursive: true });
    writeFileSync(
      join(rootDir, 'docs', 'TASK_LIST.md'),
      [
        '# Tasks',
        '',
        '## Current Status',
        '- [x] Completed Image slice',
        '- [ ] Remaining Image parity work',
        '',
        '## Later',
        '- [ ] Later task',
      ].join('\n'),
    );
    writeFileSync(join(rootDir, 'docs', 'notes', '002-latest.md'), '# Latest Dashboard Note\n\nDetails');
    writeFileSync(join(rootDir, 'docs', 'notes', '001-older.md'), '# Older Note\n');
    writeFileSync(
      join(rootDir, 'src', 'components', 'ImageEditor', 'ImagePhotoshopParity.ts'),
      [
        "{ id: 'crop', area: 'Crop', signalLoom: 'Crop rectangle with apply/cancel exists', status: 'partial', priority: 'high', parityEstimate: 41 },",
        "{ id: 'text-tool', area: 'Text Tool', signalLoom: 'Text metadata exists; live type lags', status: 'partial', priority: 'high', parityEstimate: 20 },",
        "{ id: 'liquify', area: 'Liquify', signalLoom: 'Missing', status: 'remaining', priority: 'medium', parityEstimate: 0 },",
      ].join('\n'),
    );
    writeFileSync(join(rootDir, 'dist', 'index.html'), '<!doctype html>');
    writeFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'assets', 'public', 'index.html'), '<!doctype html>');
    writeFileSync(join(rootDir, 'output', 'playwright', 'image-slice', 'evidence.png'), 'png');
    writeFileSync(join(rootDir, 'src', 'components', 'ImageEditor', 'tools', 'cropTool.test.ts'), 'test');
    writeFileSync(join(rootDir, 'src', 'components', 'ImageEditor', 'ImageTextLayer.test.ts'), 'test');
    writeFileSync(
      join(rootDir, 'output', 'native-real-project-soak', 'latest', 'real-project-soak-report.json'),
      JSON.stringify({
        ok: true,
        startup: {
          sourceItems: 208,
          paperPages: 24,
          workspaceWindows: [
            { ok: true, workspace: 'flow' },
            { ok: true, workspace: 'image' },
          ],
        },
        soak: { cycles: 2 },
      }),
    );
    writeFileSync(
      join(rootDir, 'output', 'native-paper-pdf-parity', 'latest', 'paper-pdf-parity-report.json'),
      JSON.stringify({
        ok: true,
        requestedPages: [12, 20],
        pdf: { bytes: 2273280 },
        comparisons: [{ pageNumber: 12, ok: true }, { pageNumber: 20, ok: true }],
      }),
    );
    writeFileSync(
      join(rootDir, 'ops', 'dev-dashboard', 'artifacts', 'android-image-smoke-latest.json'),
      JSON.stringify({
        kind: 'android-image-smoke',
        timestamp: '2026-06-12T20:52:29-06:00',
        device: { serial: 'R3GL40ABQXM', model: 'SM-S948U', androidRelease: '16', apiLevel: 36 },
        app: {
          packageId: 'studio.sloom.signalloom',
          visible: true,
          installed: true,
          pid: 21649,
          focusedActivity: 'studio.sloom.signalloom/studio.sloom.signalloom.MainActivity',
        },
        readinessAssessment: {
          androidReadinessMovement: 'partial',
          strongEnoughToMoveAndroidReadiness: false,
        },
        findings: ['ADB real-device connectivity is fresh and positive.'],
      }),
    );
    writeFileSync(
      join(rootDir, 'ops', 'dev-dashboard', 'artifacts', 'android-dex-4k-display-latest.json'),
      JSON.stringify({
        kind: 'android-dex-4k-display',
        timestamp: '2026-06-12T20:58:47-06:00',
        device: { serial: 'R3GL40ABQXM', model: 'SM-S948U' },
        display: {
          displayId: 9,
          logicalWidth: 3840,
          logicalHeight: 2160,
          densityDpi: 320,
          widthDp: 1920,
          heightDp: 1080,
          bottomNavigationInsetPx: 56,
        },
        readinessAssessment: {
          androidReadinessMovement: 'partial',
          strongEnoughToMoveAndroidReadiness: false,
        },
      }),
    );

    const model = buildDashboardModel({ rootDir });
    const html = renderDashboardHtml(model);

    expect(DEFAULT_DASHBOARD_PORT).toBe(7890);
    expect(model.tasks.currentStatus.completed.map((task) => task.text)).toEqual(['Completed Image slice']);
    expect(model.tasks.currentStatus.remaining.map((task) => task.text)).toEqual(['Remaining Image parity work']);
    expect(model.notes[0]).toMatchObject({ fileName: '002-latest.md', title: 'Latest Dashboard Note' });
    expect(model.imageParity).toMatchObject({
      done: 1,
      partial: 1,
      remaining: 1,
      highPriority: 2,
      trackedRows: 3,
      checklistAverage: 50,
      highPriorityChecklistAverage: 75,
      parityProgressPercent: 50,
      highPriorityProgress: 75,
      completedImageTasks: 1,
      openImageTasks: 1,
    });
    expect(model.imageParity).not.toHaveProperty('auditAverage');
    expect(model.imageParity).not.toHaveProperty('highPriorityAuditAverage');
    expect(model.imageParity).not.toHaveProperty('weightedProgress');
    expect(model.imageParity).not.toHaveProperty('legacyEstimateAverage');
    expect(model.imageParity).not.toHaveProperty('highPriorityLegacyEstimateAverage');
    expect(model.imageParity).not.toHaveProperty('readinessScore');
    expect(model.imageParity).not.toHaveProperty('readinessPercent');
    expect(model.imageParity).not.toHaveProperty('verificationConfidencePercent');
    expect(model.imageCapabilities).toMatchObject({
      total: 3,
      highPriorityPartialOrRemaining: 1,
      highPriorityPartial: 1,
      highPriorityRemaining: 0,
    });
    expect(model.imageCapabilities.rows).toEqual([
      expect.objectContaining({
        id: 'crop',
        area: 'Crop',
        status: 'done',
        priority: 'high',
        progressPercent: 100,
        signalLoom: 'Crop rectangle with apply/cancel exists',
      }),
      expect.objectContaining({
        id: 'text-tool',
        area: 'Text Tool',
        status: 'partial',
        priority: 'high',
        progressPercent: 50,
        signalLoom: 'Text metadata exists; live type lags',
      }),
      expect.objectContaining({
        id: 'liquify',
        area: 'Liquify',
        status: 'remaining',
        priority: 'medium',
        progressPercent: 0,
        signalLoom: 'Missing',
      }),
    ]);
    for (const row of model.imageCapabilities.rows) {
      expect(row).not.toHaveProperty('sourceStatus');
      expect(row).not.toHaveProperty('parityEstimate');
    }
    expect(model.imageCapabilities.topIncomplete.map((row) => row.id)).toEqual([
      'text-tool',
      'liquify',
    ]);
    expect(model.imageParityRun).toMatchObject({
      total: 3,
      averageProgress: model.imageParity.parityProgressPercent,
    });
    expect(model.imageParityRun.features.map((feature) => feature.id)).toEqual(['crop', 'text-tool', 'liquify']);
    expect(model.imageParityRun.features.find((feature) => feature.id === 'crop')).toMatchObject({
      feature: 'Crop',
      objective: 'Crop',
      status: 'done',
      priority: 'high',
      progressPercent: 100,
      currentState: 'Crop rectangle with apply/cancel exists',
      checklist: expect.objectContaining({
        method: 'completed Boolean atoms / total Boolean atoms',
        completed: 1,
        remaining: 0,
        total: 1,
        progressPercent: 100,
      }),
    });
    for (const feature of model.imageParityRun.features) {
      expect(feature).not.toHaveProperty('sourceStatus');
      expect(feature).not.toHaveProperty('auditEstimate');
    }
    expect(model.imageParityRun.features.find((feature) => feature.id === 'liquify')).toMatchObject({
      progressPercent: 0,
    });
    expect(model.imageParityRun.features[0]).not.toHaveProperty('verificationConfidence');
    expect(model.imageParityRun.features[0]).not.toHaveProperty('implementation');
    expect(model.imageParityRun.features[0]).not.toHaveProperty('ux');
    expect(model.imageParityRun.features[0]).not.toHaveProperty('tests');
    expect(model.imageParityRun.features[0]).not.toHaveProperty('desktop');
    expect(model.imageParityRun.features[0]).not.toHaveProperty('android');
    expect(model.goalProgress).toMatchObject({
      percent: model.imageParity.parityProgressPercent,
      completed: 1,
      remaining: 1,
      total: 2,
    });
    expect(model.telemetry.build).toMatchObject({ available: true, path: 'dist/index.html' });
    expect(model.telemetry.androidSync).toMatchObject({ available: true, path: 'android/app/src/main/assets/public/index.html' });
    expect(model.telemetry.playwright).toMatchObject({
      screenshotCount: 1,
      latestScreenshot: expect.objectContaining({ path: 'output/playwright/image-slice/evidence.png' }),
    });
    expect(model.telemetry.nativeSoak).toMatchObject({
      available: true,
      ok: true,
      path: 'output/native-real-project-soak/latest/real-project-soak-report.json',
      sourceItems: 208,
      paperPages: 24,
      workspaceWindows: 2,
      cycles: 2,
    });
    expect(model.telemetry.paperPdfParity).toMatchObject({
      available: true,
      ok: true,
      path: 'output/native-paper-pdf-parity/latest/paper-pdf-parity-report.json',
      requestedPages: [12, 20],
      comparisonCount: 2,
      pdfBytes: 2273280,
    });
    expect(model.telemetry.androidImageSmoke).toMatchObject({
      available: true,
      ok: true,
      path: 'ops/dev-dashboard/artifacts/android-image-smoke-latest.json',
      device: 'SM-S948U',
      androidRelease: '16',
      apiLevel: 36,
      packageId: 'studio.sloom.signalloom',
      installed: true,
      visible: true,
      focusedActivity: 'studio.sloom.signalloom/studio.sloom.signalloom.MainActivity',
      readinessMovement: 'partial',
      strongEnoughToMoveAndroidReadiness: false,
      findingCount: 1,
    });
    expect(model.telemetry.androidDex4kDisplay).toMatchObject({
      available: true,
      ok: true,
      path: 'ops/dev-dashboard/artifacts/android-dex-4k-display-latest.json',
      device: 'SM-S948U',
      displayId: 9,
      logicalWidth: 3840,
      logicalHeight: 2160,
      densityDpi: 320,
      widthDp: 1920,
      heightDp: 1080,
      bottomNavigationInsetPx: 56,
      readinessMovement: 'partial',
      strongEnoughToMoveAndroidReadiness: false,
    });
    expect(html).toContain('Signal Loom Development Dashboard');
    expect(html).toContain('Remaining Image parity work');
    expect(html).toContain('Latest Dashboard Note');
    expect(html).toContain('Image Parity');
    expect(html).toContain('Image Parity Progress');
    expect(html).not.toContain('Verification Confidence');
    expect(html).not.toContain('Image Readiness');
    expect(html).toContain('Image Capabilities');
    expect(html).toContain('Text Tool');
    expect(html).toContain('Text metadata exists; live type lags');
    expect(html).toContain('50% checklist-backed parity progress');
    expect(html).toContain('Goal Progress');
    expect(html).toContain(`${model.imageParity.parityProgressPercent}%`);
    expect(html).toContain('1 completed Image tasks');
    expect(html).toContain('Verification Telemetry');
    expect(html).toContain('real-project-soak-report.json');
    expect(html).toContain('paper-pdf-parity-report.json');
    expect(html).toContain('Android Image smoke: PASS ops/dev-dashboard/artifacts/android-image-smoke-latest.json');
    expect(html).toContain('device: SM-S948U');
    expect(html).toContain('package: studio.sloom.signalloom');
    expect(html).toContain('Android Dex 4K display: PASS ops/dev-dashboard/artifacts/android-dex-4k-display-latest.json');
    expect(html).toContain('display: 3840x2160');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('Image Parity Run');
    expect(html).toContain('Feature Plan Progress');
    expect(html).toContain('data-tab-panel="parity-run"');
    expect(html).toContain('Crop rectangle with apply/cancel exists');
    expect(html).toContain('Progress and status are calculated only from completed Boolean checklist atoms');
    expect(html).toContain('<th scope="col">Progress</th>');
    expect(html).not.toContain('<th scope="col">Verification Confidence</th>');
    expect(html).not.toContain('<th scope="col">Evidence</th>');
    expect(html).toContain('Feature progress');
    expect(html).not.toContain('<th scope="col">Readiness</th>');
    expect(html).toContain('localhost:7890');
  });

  it('renders checklist-complete parity-run rows as done even if a stale feature status says partial', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'signal-loom-dashboard-stale-partial-'));
    mkdirSync(join(rootDir, 'docs', 'notes'), { recursive: true });
    mkdirSync(join(rootDir, 'src', 'components', 'ImageEditor'), { recursive: true });
    writeFileSync(join(rootDir, 'docs', 'TASK_LIST.md'), '# Tasks\n\n## Current Status\n');
    writeFileSync(
      join(rootDir, 'src', 'components', 'ImageEditor', 'ImagePhotoshopParity.ts'),
      [
        "export const IMAGE_PHOTOSHOP_PARITY_ITEMS = [",
        "  {",
        "    id: 'brush-engine',",
        "    area: 'Brush / Eraser Engine',",
        "    photoshop: 'Brush presets, tips, textures, dynamics, smoothing, symmetry, pressure and tilt response',",
        "    signalLoom: 'Brush presets, tips, textures, dynamics, smoothing, symmetry, pressure and tilt response now exist',",
        "    priority: 'high',",
        "    status: 'partial',",
        "    parityEstimate: 75,",
        "    workflowReason: 'Painting and retouching quality rises or falls with the brush engine.',",
        "  },",
        "];",
      ].join('\n'),
    );

    const model = buildDashboardModel({ rootDir });
    const brush = model.imageParityRun.features.find((feature) => feature.id === 'brush-engine');
    brush.status = 'partial';
    const html = renderDashboardHtml(model);

    expect(brush.checklist).toMatchObject({
      completed: 8,
      remaining: 0,
      total: 8,
      progressPercent: 100,
    });
    expect(html).toContain('Checklist 8/8');
    expect(html).toContain('data-feature-status="done"');
    expect(html).not.toContain('data-feature-status="partial"');
  });

  it('surfaces low-checklist-progress high-priority incomplete Image capabilities first', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'signal-loom-dashboard-capabilities-'));
    mkdirSync(join(rootDir, 'docs', 'notes'), { recursive: true });
    mkdirSync(join(rootDir, 'src', 'components', 'ImageEditor'), { recursive: true });
    writeFileSync(join(rootDir, 'docs', 'TASK_LIST.md'), '# Tasks\n\n## Current Status\n');
    writeFileSync(
      join(rootDir, 'src', 'components', 'ImageEditor', 'ImagePhotoshopParity.ts'),
      `
        export const IMAGE_PHOTOSHOP_PARITY_ITEMS = [
          {
            id: 'selection-tools',
            area: 'Selection Tools',
            signalLoom: 'Selection tools are much deeper now',
            priority: 'high',
            status: 'partial',
            parityEstimate: 72,
          },
          {
            id: 'text-tool',
            area: 'Text Tool',
            signalLoom: 'Text metadata and rerasterization exist with basic paragraph controls; live type and typography controls lag badly',
            priority: 'high',
            status: 'partial',
            parityEstimate: 30,
          },
          {
            id: 'layer-styles',
            area: 'Layer Styles',
            signalLoom: 'Stroke, drop shadow, outer glow, and color overlay exist; most style families and presets are missing',
            priority: 'high',
            status: 'partial',
            parityEstimate: 25,
          },
          {
            id: 'clone-heal-retouch',
            area: 'Clone / Heal / Retouch',
            signalLoom: 'Clone stamp, spot heal, blur, sharpen, smudge, dodge, burn, and sponge exist with limited pro options',
            priority: 'high',
            status: 'partial',
            parityEstimate: 30,
          },
          {
            id: 'gradients',
            area: 'Gradients',
            signalLoom: 'Linear and radial gradients now exist with foreground-to-background vs foreground-to-transparent presets, reverse, and persisted tool controls; multi-stop editing remains missing',
            priority: 'high',
            status: 'partial',
            parityEstimate: 30,
          },
          {
            id: 'export-formats',
            area: 'TIFF / SVG / GIF / Raster Export',
            signalLoom: 'PNG, JPEG, WebP, AVIF, BMP, static GIF, TIFF, SVG, PSD, and XCF save/export paths exist with limitations',
            priority: 'medium',
            status: 'partial',
            parityEstimate: 45,
          },
        ];
      `,
    );

    const model = buildDashboardModel({ rootDir });

    expect(model.imageCapabilities.highPriorityPartialOrRemaining).toBe(4);
    const topHighPriorityRows = model.imageCapabilities.topIncomplete
      .filter((row) => row.priority === 'high');
    expect(topHighPriorityRows).toHaveLength(4);
    expect(topHighPriorityRows.map((row) => row.progressPercent)).toEqual(
      topHighPriorityRows.map((row) => row.progressPercent).toSorted((a, b) => a - b),
    );
    expect(model.imageCapabilities.topIncomplete.slice(0, 4).every((row) => row.priority === 'high')).toBe(true);
    expect(model.imageCapabilities.topIncomplete.slice(0, 4)).toEqual([
      expect.objectContaining({
        id: expect.any(String),
        status: 'partial',
        checklist: expect.objectContaining({
          method: 'completed Boolean atoms / total Boolean atoms',
        }),
        progressPercent: expect.any(Number),
      }),
      expect.objectContaining({ priority: 'high', progressPercent: expect.any(Number) }),
      expect.objectContaining({ priority: 'high', progressPercent: expect.any(Number) }),
      expect.objectContaining({ priority: 'high', progressPercent: expect.any(Number) }),
    ]);
    for (const row of model.imageCapabilities.topIncomplete) {
      expect(row).not.toHaveProperty('parityEstimate');
      expect(row).not.toHaveProperty('sourceStatus');
    }
  });

  it('renders feature progress with always-visible static Boolean checklist atoms and active worker lane styling', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'signal-loom-dashboard-checklist-'));
    mkdirSync(join(rootDir, 'docs', 'notes'), { recursive: true });
    mkdirSync(join(rootDir, 'src', 'components', 'ImageEditor'), { recursive: true });
    mkdirSync(join(rootDir, 'ops', 'dev-dashboard', 'artifacts'), { recursive: true });
    writeFileSync(join(rootDir, 'docs', 'TASK_LIST.md'), '# Tasks\n\n## Current Status\n');
    writeFileSync(
      join(rootDir, 'src', 'components', 'ImageEditor', 'ImagePhotoshopParity.ts'),
      `
        export const IMAGE_PHOTOSHOP_PARITY_ITEMS = [
          {
            id: 'crop',
            area: 'Crop',
            photoshop: 'Crop handles, aspect presets, overlays, straighten, rotate crop, perspective crop, content-aware crop',
            signalLoom: 'Crop rectangle with apply/cancel, aspect presets, guide overlays, straighten, rotate crop, and destructive/non-destructive commits exist; perspective crop and content-aware corner fill remain incomplete',
            priority: 'high',
            status: 'partial',
            parityEstimate: 41,
          },
          {
            id: 'liquify',
            area: 'Liquify',
            photoshop: 'Push, twirl, pucker, bloat, freeze mask, reconstruct',
            signalLoom: 'Missing',
            priority: 'medium',
            status: 'remaining',
            parityEstimate: 0,
          },
        ];
      `,
    );
    writeFileSync(
      join(rootDir, 'ops', 'dev-dashboard', 'artifacts', 'image-parity-workers-latest.json'),
      JSON.stringify({
        kind: 'image-parity-workers',
        updatedAt: '2026-06-13T12:00:00.000Z',
        workers: [
          {
            id: 'worker-a',
            name: 'Ada lane',
            color: '#7c3aed',
            status: 'active',
            task: 'Crop checklist transparency',
            featureIds: ['crop'],
          },
          {
            id: 'worker-b',
            name: 'Grace lane',
            color: '#0f766e',
            status: 'completed',
            task: 'Completed liquify slice',
            featureIds: ['liquify'],
          },
        ],
      }),
    );

    const model = buildDashboardModel({ rootDir });
    const html = renderDashboardHtml(model);
    const crop = model.imageParityRun.features.find((feature) => feature.id === 'crop');
    const liquify = model.imageParityRun.features.find((feature) => feature.id === 'liquify');

    expect(model.telemetry.imageParityWorkers).toMatchObject({
      available: true,
      ok: true,
      activeCount: 1,
      workers: [
        expect.objectContaining({
          id: 'worker-a',
          name: 'Ada lane',
          color: '#7c3aed',
          status: 'active',
          task: 'Crop checklist transparency',
          featureIds: ['crop'],
        }),
        expect.objectContaining({
          id: 'worker-b',
          name: 'Grace lane',
          color: '#0f766e',
          status: 'complete',
          task: 'Completed liquify slice',
          featureIds: ['liquify'],
        }),
      ],
    });
    expect(crop?.progressPercent).toBe(crop?.checklist.progressPercent);
    expect(crop?.checklist).toMatchObject({
      method: 'completed Boolean atoms / total Boolean atoms',
    });
    expect(crop?.checklist.total).toBe(crop?.checklist.completed + crop?.checklist.remaining);
    expect(crop?.checklist.completed).toBeGreaterThan(0);
    expect(crop?.checklist.remaining).toBeGreaterThan(0);
    expect(crop?.checklist.items.filter((item) => item.complete)).toHaveLength(crop?.checklist.completed);
    expect(crop?.checklist.items.filter((item) => !item.complete)).toHaveLength(crop?.checklist.remaining);
    expect(crop?.checklist.items.some((item) => item.complete && /crop rectangle/i.test(item.label))).toBe(true);
    expect(crop?.checklist.items.some((item) => !item.complete && /perspective crop|content-aware corner fill|crop handles/i.test(item.label))).toBe(true);
    expect(crop?.checklist.items.some((item) => item.complete && /perspective crop|content-aware corner fill/i.test(item.label))).toBe(false);
    expect(crop?.workers).toEqual([
      expect.objectContaining({
        id: 'worker-a',
        name: 'Ada lane',
        color: '#7c3aed',
        status: 'active',
      }),
    ]);
    expect(liquify?.workers).toEqual([
      expect.objectContaining({
        id: 'worker-b',
        name: 'Grace lane',
        color: '#0f766e',
        status: 'complete',
      }),
    ]);
    expect(liquify?.checklist.items.filter((item) => item.complete)).toHaveLength(0);

    expect(html).toContain('data-feature-id="crop"');
    expect(html).toContain('data-worker-active="true"');
    expect(html).toContain('--worker-color: #7c3aed');
    expect(html).toContain('Ada lane');
    expect(html).toContain(`Checklist ${crop?.checklist.completed}/${crop?.checklist.total}`);
    expect(html).toContain('completed Boolean atoms / total Boolean atoms');
    expect(html).toContain('class="feature-checklist"');
    expect(html).toContain('<td class="checklist-cell">');
    expect(html).toContain('data-static-checklist="true"');
    expect(html).not.toContain('<details class="feature-checklist">');
    expect(html).not.toContain('<summary>');
    expect(html).not.toContain('<button class="feature-checklist');
    expect(html).not.toContain('aria-expanded');
    expect(html).not.toContain('data-checklist-toggle');
    expect(html).not.toContain('data-checklist-collapsible');
    expect(html).toContain('class="feature-checklist-title"');
    expect(html).toContain('.feature-checklist {');
    expect(html).toContain('max-height: none;');
    expect(html).toContain('overflow: visible;');
    expect(html).toContain('.checklist-cell { min-width: 320px; overflow: visible; }');
    expect(html).toContain('.checklist-items { list-style: none; padding: 0; margin: 0; max-height: none; overflow: visible; }');
    expect(html).not.toContain('max-height: 260px; overflow: auto');
    expect(html).toContain('.table-wrap {');
    expect(html).toContain('max-height: none;');
    expect(html).toContain('overflow: visible;');
    expect(html).not.toContain('.table-wrap { max-height: 72vh; overflow: auto;');
    expect(html).toContain('class="check yes"');
    expect(html).toContain('class="check no"');
  });

  it('parses array-joined parity row descriptions so checklist atoms are not silently dropped', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'signal-loom-dashboard-array-joined-parity-'));
    mkdirSync(join(rootDir, 'docs', 'notes'), { recursive: true });
    mkdirSync(join(rootDir, 'src', 'components', 'ImageEditor'), { recursive: true });
    mkdirSync(join(rootDir, 'ops', 'dev-dashboard', 'artifacts'), { recursive: true });
    writeFileSync(join(rootDir, 'docs', 'TASK_LIST.md'), '# Tasks\n\n## Current Status\n');
    writeFileSync(
      join(rootDir, 'src', 'components', 'ImageEditor', 'ImagePhotoshopParity.ts'),
      `
        export const IMAGE_PHOTOSHOP_PARITY_ITEMS = [
          {
            id: 'android-parity',
            area: 'Android Image Parity',
            photoshop: 'Mobile-capable color picking, accelerated local processing, and feature parity where platform permits',
            signalLoom: [
              'Mobile-capable color picking is covered by the app picker',
              'accelerated local processing is covered by the Android native route',
              'feature parity where platform permits is tracked with DeX evidence',
              'imported-file editing coverage remains required',
            ].join('; '),
            priority: 'high',
            status: 'partial',
            parityEstimate: 73,
          },
        ];
      `,
    );

    const model = buildDashboardModel({ rootDir });
    const android = model.imageParityRun.features.find((feature) => feature.id === 'android-parity');

    expect(android?.currentState).toContain('Mobile-capable color picking');
    expect(android?.checklist.items.filter((item) => item.complete).map((item) => item.label)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Mobile-capable color picking'),
        expect.stringContaining('accelerated local processing'),
        expect.stringContaining('feature parity where platform permits'),
      ]),
    );
    expect(android?.progressPercent).toBeGreaterThan(0);
  });

  it('keeps implemented select/object handoff atoms green when AI subject detection remains unsupported', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'signal-loom-dashboard-select-object-atoms-'));
    mkdirSync(join(rootDir, 'docs', 'notes'), { recursive: true });
    mkdirSync(join(rootDir, 'src', 'components', 'ImageEditor'), { recursive: true });
    writeFileSync(join(rootDir, 'docs', 'TASK_LIST.md'), '# Tasks\n\n## Current Status\n');
    writeFileSync(
      join(rootDir, 'src', 'components', 'ImageEditor', 'ImagePhotoshopParity.ts'),
      [
        'export const IMAGE_PHOTOSHOP_PARITY_ITEMS = [',
        '  {',
        "    id: 'select-subject-object',",
        "    area: 'Select Subject / Object Selection',",
        "    photoshop: 'Subject/object selection with cloud/local fallbacks and refinement',",
        "    signalLoom: 'Local object selection handoff metadata targets Select. Mask for edge refinement handoff exists. True AI subject detection remains unsupported.',",
        "    status: 'partial',",
        "    priority: 'medium',",
        '    parityEstimate: 31,',
        '  },',
        '] as const;',
      ].join('\n'),
    );

    const model = buildDashboardModel({ rootDir });
    const feature = model.imageParityRun.features.find((entry) => entry.id === 'select-subject-object');
    const completedLabels = feature?.checklist.items.filter((item) => item.complete).map((item) => item.label) ?? [];
    const remainingLabels = feature?.checklist.items.filter((item) => !item.complete).map((item) => item.label) ?? [];

    expect(completedLabels).toEqual(expect.arrayContaining([
      expect.stringContaining('Local object selection handoff metadata targets Select'),
      expect.stringContaining('Mask for edge refinement handoff'),
    ]));
    expect(remainingLabels).not.toEqual(expect.arrayContaining([
      expect.stringContaining('local object selection handoff metadata targets Select'),
      expect.stringContaining('Mask for edge refinement'),
    ]));
    expect(remainingLabels).toEqual(expect.arrayContaining([
      expect.stringContaining('AI subject detection'),
    ]));
  });

  it('matches simple singular and plural checklist atoms without leaving false red items', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'signal-loom-dashboard-singular-plural-atoms-'));
    mkdirSync(join(rootDir, 'docs', 'notes'), { recursive: true });
    mkdirSync(join(rootDir, 'src', 'components', 'ImageEditor'), { recursive: true });
    writeFileSync(join(rootDir, 'docs', 'TASK_LIST.md'), '# Tasks\n\n## Current Status\n');
    writeFileSync(
      join(rootDir, 'src', 'components', 'ImageEditor', 'ImagePhotoshopParity.ts'),
      [
        'export const IMAGE_PHOTOSHOP_PARITY_ITEMS = [',
        '  {',
        "    id: 'paths-panel',",
        "    area: 'Paths Panel',",
        "    photoshop: 'Path thumbnails',",
        "    signalLoom: 'Path thumbnail readiness/signatures exist',",
        "    status: 'partial',",
        "    priority: 'medium',",
        '    parityEstimate: 50,',
        '  },',
        '] as const;',
      ].join('\n'),
    );

    const model = buildDashboardModel({ rootDir });
    const feature = model.imageParityRun.features.find((entry) => entry.id === 'paths-panel');

    expect(feature).toMatchObject({
      status: 'done',
      progressPercent: 100,
      checklist: expect.objectContaining({
        completed: 1,
        remaining: 0,
      }),
    });
    expect(feature?.checklist.items.map((item) => item.label)).toEqual([
      'Path thumbnail readiness/signatures',
    ]);
  });

  it('renders every Image parity feature checklist expanded with no per-row scroll container', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'signal-loom-dashboard-checklist-expanded-'));
    mkdirSync(join(rootDir, 'docs', 'notes'), { recursive: true });
    mkdirSync(join(rootDir, 'src', 'components', 'ImageEditor'), { recursive: true });
    mkdirSync(join(rootDir, 'ops', 'dev-dashboard', 'artifacts'), { recursive: true });
    writeFileSync(join(rootDir, 'docs', 'TASK_LIST.md'), '# Tasks\n\n## Current Status\n');
    writeFileSync(
      join(rootDir, 'src', 'components', 'ImageEditor', 'ImagePhotoshopParity.ts'),
      `
        export const IMAGE_PHOTOSHOP_PARITY_ITEMS = [
          {
            id: 'crop',
            area: 'Crop',
            photoshop: 'Crop handles and overlays',
            signalLoom: 'Crop rectangle exists; perspective crop remains incomplete',
            priority: 'high',
            status: 'partial',
            parityEstimate: 41,
          },
          {
            id: 'liquify',
            area: 'Liquify',
            photoshop: 'Push and twirl controls',
            signalLoom: 'Missing',
            priority: 'medium',
            status: 'remaining',
            parityEstimate: 0,
          },
          {
            id: 'histogram',
            area: 'Histogram',
            photoshop: 'Histogram panel and levels',
            signalLoom: 'Histogram panel exists',
            priority: 'low',
            status: 'done',
            parityEstimate: 100,
          },
        ];
      `,
    );
    writeFileSync(
      join(rootDir, 'ops', 'dev-dashboard', 'artifacts', 'image-parity-workers-latest.json'),
      JSON.stringify({
        kind: 'image-parity-workers',
        updatedAt: '2026-06-13T12:00:00.000Z',
        workers: [
          {
            id: 'worker-a',
            name: 'Nash',
            color: '#8b5cf6',
            status: 'active',
            task: 'Crop run',
            featureIds: ['crop'],
          },
          {
            id: 'worker-b',
            name: 'Sagan',
            color: '#14b8a6',
            status: 'queued',
            task: 'Liquify setup',
            featureIds: ['liquify'],
          },
        ],
      }),
    );

    const model = buildDashboardModel({ rootDir });
    const html = renderDashboardHtml(model);

    const featureRows = model.imageParityRun.features;

    const extractFeatureRowHtml = (featureId) => {
      const marker = `data-feature-id="${featureId}"`;
      const rowStart = html.lastIndexOf('<tr', html.indexOf(marker));
      const rowEnd = html.indexOf('</tr>', rowStart);
      return html.slice(rowStart, rowEnd + 5);
    };

    for (const feature of featureRows) {
      const rowHtml = extractFeatureRowHtml(feature.id);

      expect(rowHtml).toContain(`data-feature-id="${feature.id}"`);
      expect(rowHtml).toContain('class="feature-checklist"');
      expect(rowHtml).toContain('data-static-checklist="true"');
      expect(rowHtml).toContain('data-checklist-expanded="true"');
      expect(rowHtml).toContain('class="feature-checklist-title"');
      expect(rowHtml).toContain('class="checklist-items"');
      expect(rowHtml).not.toContain('<details');
      expect(rowHtml).not.toContain('<summary>');
      expect(rowHtml).toMatch(/class="check [a-z]+"/);
    }

    expect(html).toContain('.table-wrap {');
    expect(html).toContain('max-height: none;');
    expect(html).toContain('overflow: visible;');
    expect(html).toContain('.checklist-items { list-style: none; padding: 0; margin: 0; max-height: none; overflow: visible; }');
    expect(html).not.toContain('max-height: 260px; overflow: auto');
  });

  it('calculates feature progress from Boolean checklist atoms and marks worker-mapped rows', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'signal-loom-dashboard-worker-progress-'));
    mkdirSync(join(rootDir, 'docs', 'notes'), { recursive: true });
    mkdirSync(join(rootDir, 'src', 'components', 'ImageEditor'), { recursive: true });
    mkdirSync(join(rootDir, 'ops', 'dev-dashboard', 'artifacts'), { recursive: true });
    writeFileSync(join(rootDir, 'docs', 'TASK_LIST.md'), '# Tasks\n\n## Current Status\n');
    writeFileSync(
      join(rootDir, 'src', 'components', 'ImageEditor', 'ImagePhotoshopParity.ts'),
      `
        export const IMAGE_PHOTOSHOP_PARITY_ITEMS = [
          {
            id: 'text-tool',
            area: 'Text Tool',
            photoshop: 'Typography panel and style edits',
            signalLoom: 'Text metadata, controls, and spacing controls exist; line-height fine tuning remains incomplete',
            priority: 'high',
            status: 'partial',
            parityEstimate: 54,
          },
          {
            id: 'eraser',
            area: 'Magic Eraser',
            photoshop: 'Brush engine and tolerant clearing',
            signalLoom: 'Magic eraser exists; brush fallback controls remain basic',
            priority: 'medium',
            status: 'partial',
            parityEstimate: 40,
          },
          {
            id: 'gradient',
            area: 'Gradients',
            photoshop: 'Linear and radial',
            signalLoom: 'Gradient editing exists',
            priority: 'low',
            status: 'done',
            parityEstimate: 100,
          },
        ];
      `,
    );
    writeFileSync(
      join(rootDir, 'ops', 'dev-dashboard', 'artifacts', 'image-parity-workers-latest.json'),
      JSON.stringify({
        kind: 'image-parity-workers',
        updatedAt: '2026-06-13T12:00:00.000Z',
        workers: [
          {
            id: 'worker-a',
            name: 'Sagan',
            color: '#8b5cf6',
            status: 'active',
            task: 'Text feature work',
            featureIds: ['text-tool'],
          },
          {
            id: 'worker-b',
            name: 'Nash',
            color: '#14b8a6',
            status: 'completed',
            task: 'Gradients verification',
            featureIds: ['gradient'],
          },
        ],
      }),
    );

    const model = buildDashboardModel({ rootDir });
    const html = renderDashboardHtml(model);

    const calculateChecklistProgress = (feature) => (feature.checklist.total > 0
      ? Math.round((feature.checklist.completed / feature.checklist.total) * 1000) / 10
      : 0);

    const extractFeatureRowHtml = (featureId) => {
      const marker = `data-feature-id="${featureId}"`;
      const rowStart = html.lastIndexOf('<tr', html.indexOf(marker));
      const rowEnd = html.indexOf('</tr>', rowStart);
      return html.slice(rowStart, rowEnd + 5);
    };

    for (const feature of model.imageParityRun.features) {
      const expected = calculateChecklistProgress(feature);
      const expectedRounded = Math.round(expected * 10) / 10;

      expect(feature.progressPercent).toBe(expectedRounded);
      expect(feature.checklist.total).toBe(feature.checklist.completed + feature.checklist.remaining);
      expect(feature.checklist.method).toBe('completed Boolean atoms / total Boolean atoms');

      const rowHtml = extractFeatureRowHtml(feature.id);
      expect(rowHtml).toContain(`data-progress-method="checklist-atoms"`);
      expect(rowHtml).toContain(`data-worker-mapped="${feature.workers.length > 0}"`);
      expect(rowHtml).toContain(`data-worker-count="${feature.workers.length}"`);

      const hasActiveWorker = feature.workers.some((worker) => worker.status === 'active');
      expect(rowHtml).toContain(`data-worker-active="${hasActiveWorker}"`);
      if (hasActiveWorker) {
        expect(rowHtml).toContain('parity-row-worker-active');
        expect(rowHtml).toContain('data-worker-statuses="active"');
      } else if (feature.workers.length > 0) {
        expect(rowHtml).toContain('parity-row-worker-mapped');
        expect(rowHtml).toContain(`data-worker-statuses="${feature.workers.map((worker) => worker.status).join(',')}"`);
      }

      expect(rowHtml).toContain(`>${expectedRounded}%</span>`);
      if (feature.workers.length > 0) {
        expect(rowHtml).toContain('worker-chip');
      }
      expect(rowHtml).toContain('Checklist');
    }

    expect(html).toContain('data-auto-refresh-status="enabled"');
    expect(html).toContain('setInterval(pollDashboardStatus, dashboardPollIntervalMs);');
    expect(html).toContain('fetch(\'/status.json\'');
  });

  it('reports 100 percent checklist rows as done even when the audit source status is still partial', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'signal-loom-dashboard-computed-status-'));
    mkdirSync(join(rootDir, 'docs', 'notes'), { recursive: true });
    mkdirSync(join(rootDir, 'src', 'components', 'ImageEditor'), { recursive: true });
    writeFileSync(join(rootDir, 'docs', 'TASK_LIST.md'), '# Tasks\n\n## Current Status\n');
    writeFileSync(
      join(rootDir, 'src', 'components', 'ImageEditor', 'ImagePhotoshopParity.ts'),
      `
        export const IMAGE_PHOTOSHOP_PARITY_ITEMS = [
          {
            id: 'complete-from-atoms',
            area: 'Complete From Atoms',
            photoshop: 'Open image directly and export edited copy',
            signalLoom: 'Open image directly and export edited copy exist',
            priority: 'high',
            status: 'partial',
            parityEstimate: 80,
          },
          {
            id: 'open-from-atoms',
            area: 'Open From Atoms',
            photoshop: 'Mask create and refine',
            signalLoom: 'Mask create exists; refine remains missing',
            priority: 'high',
            status: 'partial',
            parityEstimate: 50,
          },
          {
            id: 'gap-from-atoms',
            area: 'Gap From Atoms',
            photoshop: 'Native PSD import',
            signalLoom: 'Native PSD import missing',
            priority: 'medium',
            status: 'remaining',
            parityEstimate: 0,
          },
        ];
      `,
    );

    const model = buildDashboardModel({ rootDir });
    const completeFeature = model.imageParityRun.features.find((feature) => feature.id === 'complete-from-atoms');
    const openFeature = model.imageParityRun.features.find((feature) => feature.id === 'open-from-atoms');

    expect(completeFeature).toMatchObject({
      status: 'done',
      progressPercent: 100,
    });
    expect(openFeature).toMatchObject({
      status: 'partial',
    });
    expect(completeFeature).not.toHaveProperty('sourceStatus');
    expect(completeFeature).not.toHaveProperty('auditEstimate');
    expect(openFeature).not.toHaveProperty('sourceStatus');
    expect(openFeature).not.toHaveProperty('auditEstimate');
    expect(model.imageParity).toMatchObject({
      done: 1,
      partial: 1,
      remaining: 1,
      highPriority: 2,
    });
    expect(model.imageParity).not.toHaveProperty('readinessScore');
    expect(model.imageParity).not.toHaveProperty('verificationConfidencePercent');
    expect(model.imageParity).not.toHaveProperty('weightedProgress');

    const html = renderDashboardHtml(model);
    expect(html).toContain('1 done');
    expect(html).toContain('1 partial');
    expect(html).not.toContain('Verification Confidence');
    expect(html).not.toContain('Image Readiness');
    expect(html).not.toContain('<th scope="col">Evidence</th>');
    expect(html).not.toContain('% parity');
  });

  it('treats documented fallback blocker descriptors as complete checklist atoms instead of false open work', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'signal-loom-dashboard-fallback-descriptor-'));
    mkdirSync(join(rootDir, 'docs', 'notes'), { recursive: true });
    mkdirSync(join(rootDir, 'src', 'components', 'ImageEditor'), { recursive: true });
    writeFileSync(join(rootDir, 'docs', 'TASK_LIST.md'), '# Tasks\n\n## Current Status\n');
    writeFileSync(
      join(rootDir, 'src', 'components', 'ImageEditor', 'ImagePhotoshopParity.ts'),
      `
        export const IMAGE_PHOTOSHOP_PARITY_ITEMS = [
          {
            id: 'select-subject-object',
            area: 'Select Subject / Object Selection',
            photoshop: 'Subject/object selection with cloud/local fallbacks and refinement',
            signalLoom: 'Subject/object selection with cloud/local fallbacks now has fallback-route descriptors through image-object-selection-fallback-routes:v1, with local-alpha-luminance-components ready, cloud-ai-subject-object-provider blocked when no provider is configured, and local route fallback signatures. Refinement handoff metadata exists. True AI subject detection remains unsupported.',
            priority: 'medium',
            status: 'partial',
            parityEstimate: 31,
          },
        ];
      `,
    );

    const feature = buildDashboardModel({ rootDir }).imageParityRun.features[0];
    const completedLabels = feature.checklist.items.filter((item) => item.complete).map((item) => item.label);
    const remainingLabels = feature.checklist.items.filter((item) => !item.complete).map((item) => item.label);

    expect(completedLabels).toContain('Subject/object selection with cloud/local fallbacks has fallback-route descriptors through image-object-selection-fallback-routes:v1');
    expect(completedLabels).toContain('cloud-ai-subject-object-provider blocked when no provider is configured');
    expect(completedLabels).toContain('local route fallback signatures');
    expect(remainingLabels).toEqual([]);
    expect(feature).toMatchObject({
      status: 'done',
      progressPercent: 100,
    });
  });

  it('extracts concrete export-format checklist atoms without malformed state fragments', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'signal-loom-dashboard-export-formats-'));
    mkdirSync(join(rootDir, 'docs', 'notes'), { recursive: true });
    mkdirSync(join(rootDir, 'src', 'components', 'ImageEditor'), { recursive: true });
    writeFileSync(join(rootDir, 'docs', 'TASK_LIST.md'), '# Tasks\n\n## Current Status\n');
    writeFileSync(
      join(rootDir, 'src', 'components', 'ImageEditor', 'ImagePhotoshopParity.ts'),
      `
        export const IMAGE_PHOTOSHOP_PARITY_ITEMS = [
          {
            id: 'export-formats',
            area: 'TIFF / SVG / GIF / Raster Export',
            photoshop: 'Broad format import/export with color, layers, animation, and warnings',
            signalLoom: 'PNG, JPEG, WebP, AVIF, BMP, static GIF, TIFF, SVG, PSD, and XCF save/export paths exist with honest format-policy descriptions, format readiness descriptors, buildImageDocumentExportReadinessDescriptor helpers, Export As / Save for Web readiness descriptors, format capability matrix metadata, scale/output-size/DPI metadata, export preset readiness, batch export readiness, Source Library / suite handoff readiness descriptors, flattened derivative caveats, blob-only URL warnings, missing source id blockers, source-linked editability caveats, XCF compatibility metadata, visible export planning metadata, DPI/PPI checks, color profile non-embedding warnings, CMYK proof limitations, TIFF/GIF/SVG export policy warnings for flattened, first-frame, rasterized, export-only, hidden-layer, mask/effect/filter, compositing, animation/frame limits, SVG vector rasterization, RAW develop-first requirements, PSB unsupported thresholds, high-bit-depth caveats, recommended handoff formats, stable preview/readiness signatures, unsupported-state descriptors, blocker descriptors, and unsupported limits, plus round-trip caveats for TIFF/GIF/SVG',
            priority: 'medium',
            status: 'partial',
            parityEstimate: 64,
            workflowReason: 'Users must know which formats are true interchange and which are flattened or limited.',
          },
        ];
      `,
    );

    const model = buildDashboardModel({ rootDir });
    const html = renderDashboardHtml(model);
    const feature = model.imageParityRun.features.find((entry) => entry.id === 'export-formats');

    expect(feature).toMatchObject({
      id: 'export-formats',
      checklist: expect.objectContaining({
        method: 'completed Boolean atoms / total Boolean atoms',
      }),
    });
    expect(feature?.checklist.completed).toBeGreaterThan(8);
    expect(feature?.checklist.total).toBeGreaterThan(feature?.checklist.completed ?? 0);

    const labels = feature?.checklist.items.map((item) => item.label) ?? [];
    const completeLabels = feature?.checklist.items.filter((item) => item.complete).map((item) => item.label) ?? [];
    const remainingLabels = feature?.checklist.items.filter((item) => !item.complete).map((item) => item.label) ?? [];

    expect(labels.some((label) => label.includes('-state'))).toBe(false);
    expect(labels.some((label) => /^state$/i.test(label))).toBe(false);
    expect(labels.some((label) => /state descriptors/i.test(label))).toBe(false);

    expect(completeLabels).toContain('PNG');
    expect(completeLabels).toContain('JPEG');
    expect(completeLabels).toContain('WebP');
    expect(completeLabels).toContain('TIFF');
    expect(completeLabels).toContain('SVG');
    expect(completeLabels).toContain('XCF save/export paths with honest format-policy descriptions');
    expect(completeLabels).toContain('recommended handoff formats');

    expect(remainingLabels.length).toBeGreaterThan(0);
    expect(remainingLabels[0]).toBeDefined();
    expect(html).toContain('data-feature-id="export-formats"');
    expect(html).toContain('class="feature-checklist"');
    expect(html).toContain('max-height: none;');
    expect(html).not.toContain('max-height: 260px; overflow: auto');
    expect(html).toContain('data-auto-refresh-status="enabled"');
    expect(html).toContain('data-dashboard-poll-interval-ms="1000"');
    expect(html).toContain('setInterval(pollDashboardStatus, dashboardPollIntervalMs);');
  });

  it('auto-refreshes the dashboard from status.json when stable status changes', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'signal-loom-dashboard-auto-refresh-'));
    mkdirSync(join(rootDir, 'docs', 'notes'), { recursive: true });
    mkdirSync(join(rootDir, 'src', 'components', 'ImageEditor'), { recursive: true });
    writeFileSync(join(rootDir, 'docs', 'TASK_LIST.md'), '# Tasks\n\n## Current Status\n- [ ] Open task\n');
    writeFileSync(
      join(rootDir, 'src', 'components', 'ImageEditor', 'ImagePhotoshopParity.ts'),
      `
        export const IMAGE_PHOTOSHOP_PARITY_ITEMS = [
          {
            id: 'crop',
            area: 'Crop',
            photoshop: 'Crop handles and overlays',
            signalLoom: 'Crop rectangle exists; perspective crop remains incomplete',
            priority: 'high',
            status: 'partial',
            parityEstimate: 41,
          },
        ];
      `,
    );

    const html = renderDashboardHtml(buildDashboardModel({ rootDir }));

    expect(html).toContain('data-auto-refresh-status="enabled"');
    expect(html).toContain('data-dashboard-poll-interval-ms="1000"');
    expect(html).toContain('data-dashboard-live-root');
    expect(html).toContain("fetch('/status.json'");
    expect(html).toContain('setInterval(pollDashboardStatus');
    expect(html).toContain('const dashboardPollIntervalMs = 1000;');
    expect(html).toContain('setInterval(pollDashboardStatus, dashboardPollIntervalMs);');
    expect(html).toContain('void pollDashboardStatus();');
    expect(html).toContain('refreshDashboardDocument(nextStatus)');
    expect(html).toContain('new DOMParser()');
    expect(html).toContain('replaceWith(nextRoot)');
    expect(html).toContain('dashboardStableSignature');
    expect(html).toContain("if (key === 'generatedAt') return undefined;");
    expect(html).not.toContain('window.location.reload()');
  });

  it('preserves active worker lane labels from the parity worker artifact and only highlights truly active rows', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'signal-loom-dashboard-worker-lanes-'));
    mkdirSync(join(rootDir, 'docs', 'notes'), { recursive: true });
    mkdirSync(join(rootDir, 'src', 'components', 'ImageEditor'), { recursive: true });
    mkdirSync(join(rootDir, 'ops', 'dev-dashboard', 'artifacts'), { recursive: true });
    writeFileSync(join(rootDir, 'docs', 'TASK_LIST.md'), '# Tasks\n\n## Current Status\n');
    writeFileSync(
      join(rootDir, 'src', 'components', 'ImageEditor', 'ImagePhotoshopParity.ts'),
      `
        export const IMAGE_PHOTOSHOP_PARITY_ITEMS = [
          {
            id: 'crop',
            area: 'Crop',
            photoshop: 'Crop handles and overlays',
            signalLoom: 'Crop rectangle exists; perspective crop remains incomplete',
            priority: 'high',
            status: 'partial',
            parityEstimate: 41,
          },
          {
            id: 'text-tool',
            area: 'Text Tool',
            photoshop: 'Typography edits',
            signalLoom: 'Text editing exists; native text interop remains incomplete',
            priority: 'high',
            status: 'partial',
            parityEstimate: 54,
          },
        ];
      `,
    );
    writeFileSync(
      join(rootDir, 'ops', 'dev-dashboard', 'artifacts', 'image-parity-workers-latest.json'),
      JSON.stringify({
        kind: 'image-parity-workers',
        updatedAt: '2026-06-13T18:00:00.000Z',
        workers: [
          {
            id: 'lane-worker-1',
            lane: 'RC1',
            agent: 'Ampere the 3rd',
            status: 'active',
            task: 'Crop parity lane',
            color: '#22c55e',
            featureIds: ['crop'],
          },
          {
            id: 'lane-worker-2',
            lane: 'QA1',
            agent: 'Maxwell',
            status: 'errored',
            task: 'Typography verification lane',
            color: '#ef4444',
            featureIds: ['text-tool'],
          },
        ],
      }),
    );

    const model = buildDashboardModel({ rootDir });
    const html = renderDashboardHtml(model);

    const cropFeature = model.imageParityRun.features.find((feature) => feature.id === 'crop');
    const textFeature = model.imageParityRun.features.find((feature) => feature.id === 'text-tool');

    expect(cropFeature?.workers).toEqual([
      expect.objectContaining({
        id: 'lane-worker-1',
        lane: 'RC1',
        agent: 'Ampere the 3rd',
        name: 'RC1',
        status: 'active',
      }),
    ]);
    expect(textFeature?.workers).toEqual([
      expect.objectContaining({
        id: 'lane-worker-2',
        lane: 'QA1',
        agent: 'Maxwell',
        name: 'QA1',
        status: 'failed',
      }),
    ]);

    const extractFeatureRowHtml = (featureId) => {
      const marker = `data-feature-id="${featureId}"`;
      const rowStart = html.lastIndexOf('<tr', html.indexOf(marker));
      const rowEnd = html.indexOf('</tr>', rowStart);
      return html.slice(rowStart, rowEnd + 5);
    };

    const cropRowHtml = extractFeatureRowHtml('crop');
    const textRowHtml = extractFeatureRowHtml('text-tool');

    expect(cropRowHtml).toContain('parity-row-worker-active');
    expect(cropRowHtml).toContain('data-worker-active="true"');
    expect(cropRowHtml).toContain('RC1');
    expect(cropRowHtml).toContain('title="RC1');
    expect(cropRowHtml).not.toContain('lane-worker-1');

    expect(textRowHtml).toContain('parity-row-worker-mapped');
    expect(textRowHtml).not.toContain('parity-row-worker-active');
    expect(textRowHtml).toContain('data-worker-active="false"');
    expect(textRowHtml).toContain('data-worker-statuses="failed"');
    expect(textRowHtml).toContain('QA1');
    expect(textRowHtml).not.toContain('lane-worker-2');
  });
});
