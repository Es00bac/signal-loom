export type DesktopWorkspaceId = 'flow' | 'editor' | 'image' | 'paper';
export type DesktopWorkspaceLaunchCommand = 'view:flow' | 'view:editor' | 'view:image' | 'view:paper';
export type DesktopPackageSurface = 'electron-native-menu';
export type DesktopPackagingReadiness = 'ready' | 'configured-with-caveats';
export type DesktopPackagingPlatform = 'windows' | 'macos' | 'linux';
export type DesktopPackagingHostRequirement =
  | 'linux-cross-build-supported'
  | 'macos-required-for-final-package'
  | 'native-linux-build-host';

export interface DesktopWorkspaceLaunchReadiness {
  workspace: DesktopWorkspaceId;
  appName: string;
  menuLabel: string;
  launchLabel: string;
  launchCommand: DesktopWorkspaceLaunchCommand;
  accelerator: string;
  packageSurface: DesktopPackageSurface;
  readiness: Extract<DesktopPackagingReadiness, 'ready'>;
  caveats: string[];
}

export interface DesktopPlatformPackagingReadiness {
  platform: DesktopPackagingPlatform;
  scriptName: string;
  script: string | undefined;
  configuredTargets: string[];
  processDocumentPath: string;
  hostRequirement: DesktopPackagingHostRequirement;
  readiness: Extract<DesktopPackagingReadiness, 'configured-with-caveats'>;
  caveats: string[];
  artifactExpectations: string[];
  signingCaveats: string[];
}

export interface DesktopPackagingDependencyReadiness {
  packageName: 'electron' | 'electron-builder';
  versionRange: string | undefined;
  role: 'desktop-runtime' | 'installer-builder';
  limitation: string;
  bundledBy: string;
}

export interface DesktopPackagingChecklistItem {
  id: 'desktop-app-files' | 'native-render-resource' | 'windows-installer-dependencies';
  label: string;
  readiness: Extract<DesktopPackagingReadiness, 'ready'>;
  evidence: string[];
}

export interface DesktopPackagingReadinessSummary {
  productName: string | undefined;
  appId: string | undefined;
  workspaceLaunchSurface: DesktopPackageSurface;
  platforms: DesktopPlatformPackagingReadiness[];
  dependencies: DesktopPackagingDependencyReadiness[];
  dependencyChecklist: DesktopPackagingChecklistItem[];
  installerLimitations: string[];
}

interface ElectronBuilderTargetObject {
  target?: string;
  arch?: string[];
}

type ElectronBuilderTarget =
  | string
  | ElectronBuilderTargetObject
  | Array<string | ElectronBuilderTargetObject>
  | undefined;

interface DesktopPackagingPackageMetadata {
  build?: {
    appId?: string;
    productName?: string;
    files?: string[];
    extraResources?: Array<{
      from?: string;
      to?: string;
    }>;
    win?: {
      target?: ElectronBuilderTarget;
    };
    mac?: {
      target?: string[];
    };
    linux?: {
      target?: string[];
    };
  };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

export const DESKTOP_WORKSPACE_LAUNCH_READINESS: readonly DesktopWorkspaceLaunchReadiness[] = [
  {
    workspace: 'flow',
    appName: 'Flow',
    menuLabel: 'Flow',
    launchLabel: 'Open/Focus Flow Window',
    launchCommand: 'view:flow',
    accelerator: 'CommandOrControl+1',
    packageSurface: 'electron-native-menu',
    readiness: 'ready',
    caveats: ['Launches the Flow workspace through the shared Sloom Studio desktop binary.'],
  },
  {
    workspace: 'editor',
    appName: 'Video',
    menuLabel: 'Video',
    launchLabel: 'Open/Focus Video Window',
    launchCommand: 'view:editor',
    accelerator: 'CommandOrControl+2',
    packageSurface: 'electron-native-menu',
    readiness: 'ready',
    caveats: ['Launches the Video workspace through the shared Sloom Studio desktop binary.'],
  },
  {
    workspace: 'image',
    appName: 'Image',
    menuLabel: 'Image',
    launchLabel: 'Open/Focus Image Window',
    launchCommand: 'view:image',
    accelerator: 'CommandOrControl+3',
    packageSurface: 'electron-native-menu',
    readiness: 'ready',
    caveats: ['Launches the Image workspace through the shared Sloom Studio desktop binary.'],
  },
  {
    workspace: 'paper',
    appName: 'Paper',
    menuLabel: 'Paper',
    launchLabel: 'Open/Focus Paper Window',
    launchCommand: 'view:paper',
    accelerator: 'CommandOrControl+4',
    packageSurface: 'electron-native-menu',
    readiness: 'ready',
    caveats: ['Launches the Paper workspace through the shared Sloom Studio desktop binary.'],
  },
];

export function getDesktopWorkspaceLaunchReadiness(workspace: DesktopWorkspaceId): DesktopWorkspaceLaunchReadiness {
  const descriptor = DESKTOP_WORKSPACE_LAUNCH_READINESS.find((entry) => entry.workspace === workspace);
  if (!descriptor) {
    throw new Error(`Unknown desktop workspace launch readiness: ${workspace}`);
  }
  return descriptor;
}

export function buildDesktopPackagingReadinessSummary(
  packageJson: DesktopPackagingPackageMetadata,
): DesktopPackagingReadinessSummary {
  const windowsCaveat =
    'Windows installer packaging can be prepared on Linux, but signing credentials and final validation still need a Windows-oriented release step.';
  const macNotarizationCaveat = 'Notarization requires Apple credentials outside package metadata.';

  return {
    productName: packageJson.build?.productName,
    appId: packageJson.build?.appId,
    workspaceLaunchSurface: 'electron-native-menu',
    platforms: [
      {
        platform: 'windows',
        scriptName: 'dist:win',
        script: packageJson.scripts?.['dist:win'],
        configuredTargets: normalizeElectronBuilderTargets(packageJson.build?.win?.target),
        processDocumentPath: 'docs/packaging/windows-installer.md',
        hostRequirement: 'linux-cross-build-supported',
        readiness: 'configured-with-caveats',
        caveats: [
          'NSIS and MSIX packaging are both configured for x64 only.',
          windowsCaveat,
        ],
        artifactExpectations: [
          'Expected configured artifact types: NSIS installer and MSIX package, both x64.',
          'Do not claim a signed installer artifact exists until an actual release build produces it.',
        ],
        signingCaveats: ['Windows code signing credentials are not represented in package metadata.'],
      },
      {
        platform: 'macos',
        scriptName: 'dist:mac',
        script: packageJson.scripts?.['dist:mac'],
        configuredTargets: packageJson.build?.mac?.target ?? [],
        processDocumentPath: 'docs/packaging/macos-build.md',
        hostRequirement: 'macos-required-for-final-package',
        readiness: 'configured-with-caveats',
        caveats: [
          'Final DMG packaging requires a macOS build host.',
          'Linux can only smoke-check the unsigned ZIP path and cannot replace the Mac packaging/signing/notarization process.',
          'Gatekeeper assessment is disabled for local packaging.',
        ],
        artifactExpectations: [
          'Expected configured artifact types: DMG and ZIP app packages.',
          'Do not claim a notarized app package exists until a macOS release build completes successfully.',
        ],
        signingCaveats: [
          macNotarizationCaveat,
          'A Developer ID Application certificate is required for signed distribution builds.',
        ],
      },
      {
        platform: 'linux',
        scriptName: 'dist:linux',
        script: packageJson.scripts?.['dist:linux'],
        configuredTargets: packageJson.build?.linux?.target ?? [],
        processDocumentPath: 'docs/packaging/linux-build.md',
        hostRequirement: 'native-linux-build-host',
        readiness: 'configured-with-caveats',
        caveats: [
          'AppImage, deb, and Snap targets are configured; Flatpak and RPM targets are not represented.',
          'The user-local desktop entry installer is separate from electron-builder packages.',
        ],
        artifactExpectations: ['Expected configured artifact types: AppImage, deb, and Snap packages.'],
        signingCaveats: [],
      },
    ],
    dependencies: [
      {
        packageName: 'electron',
        versionRange: getPackageVersionRange(packageJson, 'electron'),
        role: 'desktop-runtime',
        limitation: 'Native launch depends on installed npm dependencies; no Electron binary is vendored in the repository.',
        bundledBy: 'electron-builder files packaging',
      },
      {
        packageName: 'electron-builder',
        versionRange: getPackageVersionRange(packageJson, 'electron-builder'),
        role: 'installer-builder',
        limitation: 'Installer creation depends on host toolchains and signing/notarization credentials outside package metadata.',
        bundledBy: 'build-time host dependency only',
      },
    ],
    dependencyChecklist: buildDesktopPackagingDependencyChecklist(packageJson),
    installerLimitations: [
      'Flow, Video, Image, and Paper are focusable workspaces inside one Sloom Studio desktop app, not separate packaged executables.',
      'Provider credentials, model downloads, and Android accelerator setup remain runtime/user configuration and are not bundled in desktop installers.',
    ],
  };
}

function buildDesktopPackagingDependencyChecklist(
  packageJson: DesktopPackagingPackageMetadata,
): DesktopPackagingChecklistItem[] {
  const packagedFiles = packageJson.build?.files ?? [];
  const extraResources = packageJson.build?.extraResources ?? [];

  return [
    {
      id: 'desktop-app-files',
      label: 'Desktop build includes renderer, Electron entrypoints, shared code, and package metadata.',
      readiness: 'ready',
      evidence: ['dist/**/*', 'electron/**/*', 'shared/**/*', 'package.json'].filter((entry) => packagedFiles.includes(entry)),
    },
    {
      id: 'native-render-resource',
      label: 'Desktop build includes the native render helper as an extra resource.',
      readiness: 'ready',
      evidence: extraResources
        .filter((resource) => resource.from === 'ops/native-render' && resource.to === 'ops/native-render')
        .map((resource) => `${resource.from} -> ${resource.to}`),
    },
    {
      id: 'windows-installer-dependencies',
      label: 'Windows installer readiness depends on installed Electron and Electron Builder packages before packaging.',
      readiness: 'ready',
      evidence: [
        formatDependencyEvidence('electron', getPackageVersionRange(packageJson, 'electron')),
        formatDependencyEvidence('electron-builder', getPackageVersionRange(packageJson, 'electron-builder')),
      ],
    },
  ];
}

function normalizeElectronBuilderTargets(targets: ElectronBuilderTarget): string[] {
  const entries = Array.isArray(targets) ? targets : targets ? [targets] : [];
  return entries.map((entry) => {
    if (typeof entry === 'string') {
      return entry;
    }
    const target = entry.target ?? 'unknown';
    const arch = entry.arch?.join(',') ?? '';
    return arch ? `${target}:${arch}` : target;
  });
}

function getPackageVersionRange(
  packageJson: DesktopPackagingPackageMetadata,
  packageName: 'electron' | 'electron-builder',
): string | undefined {
  return packageJson.devDependencies?.[packageName] ?? packageJson.dependencies?.[packageName];
}

function formatDependencyEvidence(packageName: 'electron' | 'electron-builder', versionRange: string | undefined): string {
  return versionRange ? `${packageName}@${versionRange}` : `${packageName}@missing`;
}
