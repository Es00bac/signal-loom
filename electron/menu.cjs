const SIGNAL_LOOM_MENU_COMMANDS = Object.freeze({
  fileNew: 'file:new',
  fileOpen: 'file:open',
  fileSave: 'file:save',
  fileSaveAs: 'file:save-as',
  fileImportMedia: 'file:import-media',
  fileSetScratchFolder: 'file:set-scratch-folder',
  fileExportProject: 'file:export-project',
  fileExportAssets: 'file:export-assets',
  settingsKeyboardShortcuts: 'settings:keyboard-shortcuts',
  settingsGamepadBindings: 'settings:gamepad-bindings',
  editUndo: 'edit:undo',
  editRedo: 'edit:redo',
  editCut: 'edit:cut',
  editCopy: 'edit:copy',
  editPaste: 'edit:paste',
  editDelete: 'edit:delete',
  editSelectAll: 'edit:select-all',
  editDeselect: 'edit:deselect',
  editInvertSelection: 'edit:invert-selection',
  viewFlow: 'view:flow',
  viewEditor: 'view:editor',
  viewImage: 'view:image',
  viewPaper: 'view:paper',
  viewToggleSourceBin: 'view:toggle-source-bin',
  viewToggleInspector: 'view:toggle-inspector',
  viewToggleInterface: 'view:toggle-interface',
  viewCommandPalette: 'view:command-palette',
  viewActivityTrail: 'view:activity-trail',
  viewLayoutReset: 'view:layout-reset',
  viewLayoutBalanced: 'view:layout-balanced',
  viewLayoutFocus: 'view:layout-focus',
  viewLayoutAllPanels: 'view:layout-all-panels',
  flowAddSourceBin: 'flow:add-source-bin',
  imageToolHand: 'image:tool-hand',
  imageToolText: 'image:tool-text',
  imageToolMove: 'image:tool-move',
  imageToolMarquee: 'image:tool-marquee',
  imageToolLasso: 'image:tool-lasso',
  imageToolMagicWand: 'image:tool-magic-wand',
  imageToolBrush: 'image:tool-brush',
  imageToolPen: 'image:tool-pen',
  imageToolEraser: 'image:tool-eraser',
  imageToolMagicEraser: 'image:tool-magic-eraser',
  imageToolCloneStamp: 'image:tool-clone-stamp',
  imageToolSpotHeal: 'image:tool-spot-heal',
  imageToolBlurBrush: 'image:tool-blur-brush',
  imageToolSharpenBrush: 'image:tool-sharpen-brush',
  imageToolSmudgeBrush: 'image:tool-smudge-brush',
  imageToolDodgeBrush: 'image:tool-dodge-brush',
  imageToolBurnBrush: 'image:tool-burn-brush',
  imageToolSpongeSaturate: 'image:tool-sponge-saturate',
  imageToolSpongeDesaturate: 'image:tool-sponge-desaturate',
  imageToolPaintBucket: 'image:tool-paint-bucket',
  imageToolGradient: 'image:tool-gradient',
  imageToolRectangleShape: 'image:tool-rectangle-shape',
  imageToolEllipseShape: 'image:tool-ellipse-shape',
  imageToolCrop: 'image:tool-crop',
  imageToolEyedropper: 'image:tool-eyedropper',
  imageExportVisible: 'image:export-visible',
  imageExportPsd: 'image:export-psd',
  timelineSelect: 'timeline:select',
  timelineCut: 'timeline:cut',
  timelineSlip: 'timeline:slip',
  timelineHand: 'timeline:hand',
  timelineSnap: 'timeline:snap',
  timelineAddKeyframe: 'timeline:add-keyframe',
  timelinePreviousKeyframe: 'timeline:previous-keyframe',
  timelineNextKeyframe: 'timeline:next-keyframe',
  paperToolSelect: 'paper:tool-select',
  paperToolHand: 'paper:tool-hand',
  paperToolText: 'paper:tool-text',
  paperToolImage: 'paper:tool-image',
  paperToolEyedropper: 'paper:tool-eyedropper',
  paperNewDocument: 'paper:new-document',
  paperAddPage: 'paper:add-page',
  paperExportPdf: 'paper:export-pdf',
  paperExportKdpAssets: 'paper:export-kdp-assets',
  paperExportReaderSpreadsPdf: 'paper:export-reader-spreads-pdf',
  paperExportBookletProofPdf: 'paper:export-booklet-proof-pdf',
  paperExportWebcomicImages: 'paper:export-webcomic-images',
  paperExportHtml: 'paper:export-html',
  paperExportReaderSpreadsHtml: 'paper:export-reader-spreads-html',
  paperExportBookletProofHtml: 'paper:export-booklet-proof-html',
  paperPackagePrint: 'paper:package-print',
  paperExportJson: 'paper:export-json',
  paperImportJson: 'paper:import-json',
  paperAddTextFrame: 'paper:add-text-frame',
  paperAddImageFrame: 'paper:add-image-frame',
  paperAddSpeechBubble: 'paper:add-speech-bubble',
  paperAddThoughtBubble: 'paper:add-thought-bubble',
  paperAddCaption: 'paper:add-caption',
  paperToggleRulers: 'paper:toggle-rulers',
  paperToggleGuides: 'paper:toggle-guides',
  paperToggleGrid: 'paper:toggle-grid',
  paperToggleSnapToGuides: 'paper:toggle-snap-to-guides',
  paperToggleSnapToGrid: 'paper:toggle-snap-to-grid',
  paperToggleSpreads: 'paper:toggle-spreads',
  paperToggleStartOnRight: 'paper:toggle-start-on-right',
  paperToggleToolsPanel: 'paper:toggle-tools-panel',
  paperToggleDocumentStripPanel: 'paper:toggle-document-strip-panel',
  paperToggleInspectorPanel: 'paper:toggle-inspector-panel',
  paperTogglePreflightPanel: 'paper:toggle-preflight-panel',
  paperToggleLinkedAssetsPanel: 'paper:toggle-linked-assets-panel',
  paperToggleDtpParityPanel: 'paper:toggle-dtp-parity-panel',
  paperResetPanels: 'paper:reset-panels',
  helpProjectDocumentation: 'help:project-documentation',
  helpTutorial: 'help:tutorial',
  helpFeatureHelp: 'help:feature-help',
  helpKeyboardShortcuts: 'help:keyboard-shortcuts',
  helpAbout: 'help:about',
});

const DESKTOP_WORKSPACE_MENU_DESCRIPTORS = Object.freeze([
  Object.freeze({
    workspace: 'flow',
    menuLabel: 'Flow',
    launchLabel: 'Open/Focus Flow Window',
    launchCommand: SIGNAL_LOOM_MENU_COMMANDS.viewFlow,
    accelerator: 'CommandOrControl+1',
    launchSurface: 'electron-native-menu',
  }),
  Object.freeze({
    workspace: 'editor',
    menuLabel: 'Video',
    launchLabel: 'Open/Focus Video Window',
    launchCommand: SIGNAL_LOOM_MENU_COMMANDS.viewEditor,
    accelerator: 'CommandOrControl+2',
    launchSurface: 'electron-native-menu',
  }),
  Object.freeze({
    workspace: 'image',
    menuLabel: 'Image',
    launchLabel: 'Open/Focus Image Window',
    launchCommand: SIGNAL_LOOM_MENU_COMMANDS.viewImage,
    accelerator: 'CommandOrControl+3',
    launchSurface: 'electron-native-menu',
  }),
  Object.freeze({
    workspace: 'paper',
    menuLabel: 'Paper',
    launchLabel: 'Open/Focus Paper Window',
    launchCommand: SIGNAL_LOOM_MENU_COMMANDS.viewPaper,
    accelerator: 'CommandOrControl+4',
    launchSurface: 'electron-native-menu',
  }),
]);

let activeKeyboardShortcuts = {};

function commandItem(label, command, sendCommand, extra = {}) {
  const accelerator = resolveCommandAccelerator(command, extra.accelerator);
  const itemExtra = {
    ...extra,
    ...(accelerator ? { accelerator } : {}),
  };

  if (!accelerator) {
    delete itemExtra.accelerator;
  }

  return {
    label,
    click: () => sendCommand(command),
    ...itemExtra,
  };
}

function workspaceLaunchItem(workspace, sendCommand) {
  const descriptor = getDesktopWorkspaceMenuDescriptor(workspace);
  return commandItem(descriptor.launchLabel, descriptor.launchCommand, sendCommand, {
    accelerator: descriptor.accelerator,
  });
}

function getDesktopWorkspaceMenuDescriptor(workspace) {
  const descriptor = DESKTOP_WORKSPACE_MENU_DESCRIPTORS.find((entry) => entry.workspace === workspace);
  if (!descriptor) {
    throw new Error(`Unknown desktop workspace menu descriptor: ${workspace}`);
  }
  return descriptor;
}

function resolveCommandAccelerator(command, fallback) {
  const shortcut = activeKeyboardShortcuts?.[command];
  if (typeof shortcut === 'string' && shortcut.trim()) {
    return toElectronAccelerator(shortcut);
  }
  return fallback;
}

function toElectronAccelerator(shortcut) {
  return shortcut
    .split('+')
    .map((part) => {
      const trimmed = part.trim();
      if (/^ctrl$/i.test(trimmed) || /^control$/i.test(trimmed)) return 'CommandOrControl';
      if (/^del$/i.test(trimmed)) return 'Delete';
      if (/^esc$/i.test(trimmed)) return 'Escape';
      return trimmed;
    })
    .filter(Boolean)
    .join('+');
}

function workspaceMenu(label, workspace, activeWorkspace, submenu) {
  return {
    label,
    enabled: activeWorkspace === workspace,
    submenu,
  };
}

function createApplicationMenuTemplate({
  appName,
  isMac = false,
  activeWorkspace = 'flow',
  keyboardShortcuts = {},
  sendCommand,
}) {
  const previousKeyboardShortcuts = activeKeyboardShortcuts;
  activeKeyboardShortcuts = keyboardShortcuts && typeof keyboardShortcuts === 'object' ? keyboardShortcuts : {};

  const template = [
    {
      label: 'Project',
      submenu: [
        commandItem('New Project', SIGNAL_LOOM_MENU_COMMANDS.fileNew, sendCommand, {
          accelerator: 'CommandOrControl+N',
        }),
        commandItem('Open...', SIGNAL_LOOM_MENU_COMMANDS.fileOpen, sendCommand, {
          accelerator: 'CommandOrControl+O',
        }),
        commandItem('Save', SIGNAL_LOOM_MENU_COMMANDS.fileSave, sendCommand, {
          accelerator: 'CommandOrControl+S',
        }),
        commandItem('Save As...', SIGNAL_LOOM_MENU_COMMANDS.fileSaveAs, sendCommand, {
          accelerator: 'CommandOrControl+Shift+S',
        }),
        { type: 'separator' },
        commandItem('Import Media...', SIGNAL_LOOM_MENU_COMMANDS.fileImportMedia, sendCommand, {
          accelerator: 'CommandOrControl+I',
        }),
        commandItem('Set Scratch Folder...', SIGNAL_LOOM_MENU_COMMANDS.fileSetScratchFolder, sendCommand),
        commandItem('Keyboard Shortcuts...', SIGNAL_LOOM_MENU_COMMANDS.settingsKeyboardShortcuts, sendCommand),
        commandItem('Gamepad Bindings...', SIGNAL_LOOM_MENU_COMMANDS.settingsGamepadBindings, sendCommand, {
          accelerator: 'CommandOrControl+Alt+G',
        }),
        { type: 'separator' },
        commandItem('Export .sloom Project...', SIGNAL_LOOM_MENU_COMMANDS.fileExportProject, sendCommand),
        commandItem('Export Assets...', SIGNAL_LOOM_MENU_COMMANDS.fileExportAssets, sendCommand),
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    workspaceMenu('Flow', 'flow', activeWorkspace, [
      workspaceLaunchItem('flow', sendCommand),
      commandItem('Add Source Bin Node', SIGNAL_LOOM_MENU_COMMANDS.flowAddSourceBin, sendCommand),
      commandItem('Export Flow Assets...', SIGNAL_LOOM_MENU_COMMANDS.fileExportAssets, sendCommand),
    ]),
    workspaceMenu('Video', 'editor', activeWorkspace, [
      workspaceLaunchItem('editor', sendCommand),
      { type: 'separator' },
      commandItem('Undo', SIGNAL_LOOM_MENU_COMMANDS.editUndo, sendCommand, {
        accelerator: 'CommandOrControl+Z',
      }),
      commandItem('Redo', SIGNAL_LOOM_MENU_COMMANDS.editRedo, sendCommand, {
        accelerator: 'CommandOrControl+Shift+Z',
      }),
      { type: 'separator' },
      commandItem('Cut', SIGNAL_LOOM_MENU_COMMANDS.editCut, sendCommand, {
        accelerator: 'CommandOrControl+X',
      }),
      commandItem('Copy', SIGNAL_LOOM_MENU_COMMANDS.editCopy, sendCommand, {
        accelerator: 'CommandOrControl+C',
      }),
      commandItem('Paste', SIGNAL_LOOM_MENU_COMMANDS.editPaste, sendCommand, {
        accelerator: 'CommandOrControl+V',
      }),
      commandItem('Delete', SIGNAL_LOOM_MENU_COMMANDS.editDelete, sendCommand, {
        accelerator: 'Delete',
      }),
      { type: 'separator' },
      commandItem('Select Tool', SIGNAL_LOOM_MENU_COMMANDS.timelineSelect, sendCommand, {
        accelerator: 'V',
      }),
      commandItem('Cut Tool', SIGNAL_LOOM_MENU_COMMANDS.timelineCut, sendCommand, {
        accelerator: 'C',
      }),
      commandItem('Slip Tool', SIGNAL_LOOM_MENU_COMMANDS.timelineSlip, sendCommand, {
        accelerator: 'S',
      }),
      commandItem('Hand Tool', SIGNAL_LOOM_MENU_COMMANDS.timelineHand, sendCommand, {
        accelerator: 'H',
      }),
      commandItem('Snap Marker Tool', SIGNAL_LOOM_MENU_COMMANDS.timelineSnap, sendCommand, {
        accelerator: 'M',
      }),
      { type: 'separator' },
      commandItem('Add or Update Keyframe', SIGNAL_LOOM_MENU_COMMANDS.timelineAddKeyframe, sendCommand, {
        accelerator: 'K',
      }),
      commandItem('Previous Keyframe', SIGNAL_LOOM_MENU_COMMANDS.timelinePreviousKeyframe, sendCommand, {
        accelerator: '[',
      }),
      commandItem('Next Keyframe', SIGNAL_LOOM_MENU_COMMANDS.timelineNextKeyframe, sendCommand, {
        accelerator: ']',
      }),
    ]),
    workspaceMenu('Image', 'image', activeWorkspace, [
      workspaceLaunchItem('image', sendCommand),
      { type: 'separator' },
      commandItem('Undo', SIGNAL_LOOM_MENU_COMMANDS.editUndo, sendCommand, {
        accelerator: 'CommandOrControl+Z',
      }),
      commandItem('Redo', SIGNAL_LOOM_MENU_COMMANDS.editRedo, sendCommand, {
        accelerator: 'CommandOrControl+Shift+Z',
      }),
      { type: 'separator' },
      commandItem('Cut', SIGNAL_LOOM_MENU_COMMANDS.editCut, sendCommand, {
        accelerator: 'CommandOrControl+X',
      }),
      commandItem('Copy', SIGNAL_LOOM_MENU_COMMANDS.editCopy, sendCommand, {
        accelerator: 'CommandOrControl+C',
      }),
      commandItem('Paste', SIGNAL_LOOM_MENU_COMMANDS.editPaste, sendCommand, {
        accelerator: 'CommandOrControl+V',
      }),
      commandItem('Delete', SIGNAL_LOOM_MENU_COMMANDS.editDelete, sendCommand, {
        accelerator: 'Delete',
      }),
      commandItem('Select All', SIGNAL_LOOM_MENU_COMMANDS.editSelectAll, sendCommand, {
        accelerator: 'CommandOrControl+A',
      }),
      commandItem('Deselect', SIGNAL_LOOM_MENU_COMMANDS.editDeselect, sendCommand, {
        accelerator: 'CommandOrControl+D',
      }),
      commandItem('Invert Selection', SIGNAL_LOOM_MENU_COMMANDS.editInvertSelection, sendCommand, {
        accelerator: 'CommandOrControl+Shift+I',
      }),
      { type: 'separator' },
      commandItem('Hand Tool', SIGNAL_LOOM_MENU_COMMANDS.imageToolHand, sendCommand, {
        accelerator: 'H',
      }),
      commandItem('Move Tool', SIGNAL_LOOM_MENU_COMMANDS.imageToolMove, sendCommand, {
        accelerator: 'V',
      }),
      commandItem('Marquee Tool', SIGNAL_LOOM_MENU_COMMANDS.imageToolMarquee, sendCommand, {
        accelerator: 'M',
      }),
      commandItem('Lasso Tool', SIGNAL_LOOM_MENU_COMMANDS.imageToolLasso, sendCommand, {
        accelerator: 'L',
      }),
      commandItem('Magic Wand Tool', SIGNAL_LOOM_MENU_COMMANDS.imageToolMagicWand, sendCommand, {
        accelerator: 'W',
      }),
      commandItem('Brush Tool', SIGNAL_LOOM_MENU_COMMANDS.imageToolBrush, sendCommand, {
        accelerator: 'B',
      }),
      commandItem('Pen Tool', SIGNAL_LOOM_MENU_COMMANDS.imageToolPen, sendCommand, {
        accelerator: 'Shift+B',
      }),
      commandItem('Eraser Tool', SIGNAL_LOOM_MENU_COMMANDS.imageToolEraser, sendCommand, {
        accelerator: 'E',
      }),
      commandItem('Magic Eraser Tool', SIGNAL_LOOM_MENU_COMMANDS.imageToolMagicEraser, sendCommand, {
        accelerator: 'Shift+E',
      }),
      commandItem('Clone Stamp Tool', SIGNAL_LOOM_MENU_COMMANDS.imageToolCloneStamp, sendCommand, {
        accelerator: 'S',
      }),
      commandItem('Spot Heal Tool', SIGNAL_LOOM_MENU_COMMANDS.imageToolSpotHeal, sendCommand, {
        accelerator: 'J',
      }),
      commandItem('Blur Brush', SIGNAL_LOOM_MENU_COMMANDS.imageToolBlurBrush, sendCommand, {
        accelerator: 'R',
      }),
      commandItem('Sharpen Brush', SIGNAL_LOOM_MENU_COMMANDS.imageToolSharpenBrush, sendCommand, {
        accelerator: 'Shift+R',
      }),
      commandItem('Smudge Brush', SIGNAL_LOOM_MENU_COMMANDS.imageToolSmudgeBrush, sendCommand, {
        accelerator: 'U',
      }),
      commandItem('Dodge Brush', SIGNAL_LOOM_MENU_COMMANDS.imageToolDodgeBrush, sendCommand, {
        accelerator: 'O',
      }),
      commandItem('Burn Brush', SIGNAL_LOOM_MENU_COMMANDS.imageToolBurnBrush, sendCommand, {
        accelerator: 'Shift+O',
      }),
      commandItem('Sponge Saturate Brush', SIGNAL_LOOM_MENU_COMMANDS.imageToolSpongeSaturate, sendCommand, {
        accelerator: 'P',
      }),
      commandItem('Sponge Desaturate Brush', SIGNAL_LOOM_MENU_COMMANDS.imageToolSpongeDesaturate, sendCommand, {
        accelerator: 'Shift+P',
      }),
      commandItem('Paint Bucket Tool', SIGNAL_LOOM_MENU_COMMANDS.imageToolPaintBucket, sendCommand, {
        accelerator: 'G',
      }),
      commandItem('Gradient Tool', SIGNAL_LOOM_MENU_COMMANDS.imageToolGradient, sendCommand, {
        accelerator: 'Shift+G',
      }),
      commandItem('Rectangle Shape Tool', SIGNAL_LOOM_MENU_COMMANDS.imageToolRectangleShape, sendCommand, {
        accelerator: 'X',
      }),
      commandItem('Ellipse Shape Tool', SIGNAL_LOOM_MENU_COMMANDS.imageToolEllipseShape, sendCommand, {
        accelerator: 'Shift+X',
      }),
      commandItem('Crop Tool', SIGNAL_LOOM_MENU_COMMANDS.imageToolCrop, sendCommand, {
        accelerator: 'C',
      }),
      commandItem('Text Tool', SIGNAL_LOOM_MENU_COMMANDS.imageToolText, sendCommand, {
        accelerator: 'T',
      }),
      commandItem('Eyedropper Tool', SIGNAL_LOOM_MENU_COMMANDS.imageToolEyedropper, sendCommand, {
        accelerator: 'I',
      }),
      { type: 'separator' },
      commandItem('Download Image File...', SIGNAL_LOOM_MENU_COMMANDS.imageExportVisible, sendCommand),
      commandItem('Download PSD...', SIGNAL_LOOM_MENU_COMMANDS.imageExportPsd, sendCommand),
    ]),
    workspaceMenu('Paper', 'paper', activeWorkspace, [
      workspaceLaunchItem('paper', sendCommand),
      { type: 'separator' },
      commandItem('Undo', SIGNAL_LOOM_MENU_COMMANDS.editUndo, sendCommand, {
        accelerator: 'CommandOrControl+Z',
      }),
      commandItem('Redo', SIGNAL_LOOM_MENU_COMMANDS.editRedo, sendCommand, {
        accelerator: 'CommandOrControl+Shift+Z',
      }),
      { type: 'separator' },
      commandItem('Cut', SIGNAL_LOOM_MENU_COMMANDS.editCut, sendCommand, {
        accelerator: 'CommandOrControl+X',
      }),
      commandItem('Copy', SIGNAL_LOOM_MENU_COMMANDS.editCopy, sendCommand, {
        accelerator: 'CommandOrControl+C',
      }),
      commandItem('Paste', SIGNAL_LOOM_MENU_COMMANDS.editPaste, sendCommand, {
        accelerator: 'CommandOrControl+V',
      }),
      commandItem('Delete', SIGNAL_LOOM_MENU_COMMANDS.editDelete, sendCommand, {
        accelerator: 'Delete',
      }),
      commandItem('Select All', SIGNAL_LOOM_MENU_COMMANDS.editSelectAll, sendCommand, {
        accelerator: 'CommandOrControl+A',
      }),
      commandItem('Deselect', SIGNAL_LOOM_MENU_COMMANDS.editDeselect, sendCommand, {
        accelerator: 'CommandOrControl+D',
      }),
      commandItem('Invert Selection', SIGNAL_LOOM_MENU_COMMANDS.editInvertSelection, sendCommand, {
        accelerator: 'CommandOrControl+Shift+I',
      }),
      { type: 'separator' },
      commandItem('Select Tool', SIGNAL_LOOM_MENU_COMMANDS.paperToolSelect, sendCommand, {
        accelerator: 'V',
      }),
      commandItem('Hand Tool', SIGNAL_LOOM_MENU_COMMANDS.paperToolHand, sendCommand, {
        accelerator: 'H',
      }),
      commandItem('Text Tool', SIGNAL_LOOM_MENU_COMMANDS.paperToolText, sendCommand, {
        accelerator: 'T',
      }),
      commandItem('Image Tool', SIGNAL_LOOM_MENU_COMMANDS.paperToolImage, sendCommand, {
        accelerator: 'Shift+I',
      }),
      commandItem('Eyedropper Tool', SIGNAL_LOOM_MENU_COMMANDS.paperToolEyedropper, sendCommand, {
        accelerator: 'I',
      }),
      { type: 'separator' },
      commandItem('New Paper Document', SIGNAL_LOOM_MENU_COMMANDS.paperNewDocument, sendCommand, {
        accelerator: 'CommandOrControl+Alt+N',
      }),
      commandItem('Add Page', SIGNAL_LOOM_MENU_COMMANDS.paperAddPage, sendCommand, {
        accelerator: 'CommandOrControl+Alt+P',
      }),
      { type: 'separator' },
      commandItem('Export Print PDF...', SIGNAL_LOOM_MENU_COMMANDS.paperExportPdf, sendCommand, {
        accelerator: 'CommandOrControl+P',
      }),
      commandItem('Export KDP Assets...', SIGNAL_LOOM_MENU_COMMANDS.paperExportKdpAssets, sendCommand),
      commandItem('Export Reader Spreads PDF...', SIGNAL_LOOM_MENU_COMMANDS.paperExportReaderSpreadsPdf, sendCommand),
      commandItem('Export Booklet Proof PDF...', SIGNAL_LOOM_MENU_COMMANDS.paperExportBookletProofPdf, sendCommand),
      commandItem('Export Webcomic Page Images...', SIGNAL_LOOM_MENU_COMMANDS.paperExportWebcomicImages, sendCommand),
      commandItem('Export Print HTML...', SIGNAL_LOOM_MENU_COMMANDS.paperExportHtml, sendCommand),
      commandItem('Export Reader Spreads HTML...', SIGNAL_LOOM_MENU_COMMANDS.paperExportReaderSpreadsHtml, sendCommand),
      commandItem('Export Booklet Proof HTML...', SIGNAL_LOOM_MENU_COMMANDS.paperExportBookletProofHtml, sendCommand),
      commandItem('Package for Print...', SIGNAL_LOOM_MENU_COMMANDS.paperPackagePrint, sendCommand),
      commandItem('Export Paper JSON...', SIGNAL_LOOM_MENU_COMMANDS.paperExportJson, sendCommand),
      commandItem('Import Paper JSON...', SIGNAL_LOOM_MENU_COMMANDS.paperImportJson, sendCommand),
      { type: 'separator' },
      commandItem('Add Text Frame', SIGNAL_LOOM_MENU_COMMANDS.paperAddTextFrame, sendCommand),
      commandItem('Add Image Frame', SIGNAL_LOOM_MENU_COMMANDS.paperAddImageFrame, sendCommand),
      commandItem('Add Speech Bubble', SIGNAL_LOOM_MENU_COMMANDS.paperAddSpeechBubble, sendCommand),
      commandItem('Add Thought Bubble', SIGNAL_LOOM_MENU_COMMANDS.paperAddThoughtBubble, sendCommand),
      commandItem('Add Caption', SIGNAL_LOOM_MENU_COMMANDS.paperAddCaption, sendCommand),
      { type: 'separator' },
      commandItem('Toggle Rulers', SIGNAL_LOOM_MENU_COMMANDS.paperToggleRulers, sendCommand),
      commandItem('Toggle Guides', SIGNAL_LOOM_MENU_COMMANDS.paperToggleGuides, sendCommand),
      commandItem('Toggle Grid', SIGNAL_LOOM_MENU_COMMANDS.paperToggleGrid, sendCommand),
      commandItem('Toggle Snap to Guides', SIGNAL_LOOM_MENU_COMMANDS.paperToggleSnapToGuides, sendCommand),
      commandItem('Toggle Snap to Grid', SIGNAL_LOOM_MENU_COMMANDS.paperToggleSnapToGrid, sendCommand),
      commandItem('Toggle Spreads', SIGNAL_LOOM_MENU_COMMANDS.paperToggleSpreads, sendCommand),
      commandItem('Toggle Start on Right', SIGNAL_LOOM_MENU_COMMANDS.paperToggleStartOnRight, sendCommand),
      { type: 'separator' },
      commandItem('Toggle Paper Tools Panel', SIGNAL_LOOM_MENU_COMMANDS.paperToggleToolsPanel, sendCommand),
      commandItem('Document / Export Bar (Pinned)', SIGNAL_LOOM_MENU_COMMANDS.paperToggleDocumentStripPanel, sendCommand),
      commandItem('Toggle Inspector Panel', SIGNAL_LOOM_MENU_COMMANDS.paperToggleInspectorPanel, sendCommand),
      commandItem('Toggle Preflight Panel', SIGNAL_LOOM_MENU_COMMANDS.paperTogglePreflightPanel, sendCommand),
      commandItem('Toggle Linked Assets Panel', SIGNAL_LOOM_MENU_COMMANDS.paperToggleLinkedAssetsPanel, sendCommand),
      commandItem('Toggle Print Production Panel', SIGNAL_LOOM_MENU_COMMANDS.paperToggleDtpParityPanel, sendCommand),
      commandItem('Reset Paper Panels', SIGNAL_LOOM_MENU_COMMANDS.paperResetPanels, sendCommand),
    ]),
    {
      label: 'View',
      submenu: [
        workspaceLaunchItem('flow', sendCommand),
        workspaceLaunchItem('editor', sendCommand),
        workspaceLaunchItem('image', sendCommand),
        workspaceLaunchItem('paper', sendCommand),
        { type: 'separator' },
        commandItem('Command Palette...', SIGNAL_LOOM_MENU_COMMANDS.viewCommandPalette, sendCommand, {
          accelerator: 'CommandOrControl+K',
        }),
        commandItem('Activity Trail...', SIGNAL_LOOM_MENU_COMMANDS.viewActivityTrail, sendCommand),
        commandItem('Toggle Interface', SIGNAL_LOOM_MENU_COMMANDS.viewToggleInterface, sendCommand, {
          accelerator: 'Tab',
        }),
        { type: 'separator' },
        commandItem('Toggle Source Bin', SIGNAL_LOOM_MENU_COMMANDS.viewToggleSourceBin, sendCommand),
        commandItem('Toggle Inspector', SIGNAL_LOOM_MENU_COMMANDS.viewToggleInspector, sendCommand),
        { type: 'separator' },
        {
          label: 'Workspace Layout Defaults',
          submenu: [
            commandItem('Reset Current Workspace Panels', SIGNAL_LOOM_MENU_COMMANDS.viewLayoutReset, sendCommand),
            commandItem('Balanced Default', SIGNAL_LOOM_MENU_COMMANDS.viewLayoutBalanced, sendCommand),
            commandItem('Focus Canvas', SIGNAL_LOOM_MENU_COMMANDS.viewLayoutFocus, sendCommand),
            commandItem('Show All Panels', SIGNAL_LOOM_MENU_COMMANDS.viewLayoutAllPanels, sendCommand),
          ],
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'reload' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        commandItem('Project Documentation', SIGNAL_LOOM_MENU_COMMANDS.helpProjectDocumentation, sendCommand),
        commandItem('Tutorial', SIGNAL_LOOM_MENU_COMMANDS.helpTutorial, sendCommand),
        commandItem('Feature Help', SIGNAL_LOOM_MENU_COMMANDS.helpFeatureHelp, sendCommand),
        { type: 'separator' },
        commandItem('Keyboard Shortcuts', SIGNAL_LOOM_MENU_COMMANDS.helpKeyboardShortcuts, sendCommand, {
          accelerator: 'F1',
        }),
        commandItem(`About ${appName}`, SIGNAL_LOOM_MENU_COMMANDS.helpAbout, sendCommand),
      ],
    },
  ];

  const result = isMac
    ? [
      {
        label: appName,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      ...template,
    ]
    : template;

  activeKeyboardShortcuts = previousKeyboardShortcuts;
  return result;
}

module.exports = {
  SIGNAL_LOOM_MENU_COMMANDS,
  DESKTOP_WORKSPACE_MENU_DESCRIPTORS,
  createApplicationMenuTemplate,
};
