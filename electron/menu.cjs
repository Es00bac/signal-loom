const SIGNAL_LOOM_MENU_COMMANDS = Object.freeze({
  fileNew: 'file:new',
  fileOpen: 'file:open',
  fileSave: 'file:save',
  fileSaveAs: 'file:save-as',
  fileImportMedia: 'file:import-media',
  fileSetScratchFolder: 'file:set-scratch-folder',
  fileExportProjectJson: 'file:export-project-json',
  fileExportAssets: 'file:export-assets',
  editUndo: 'edit:undo',
  editRedo: 'edit:redo',
  editDelete: 'edit:delete',
  viewFlow: 'view:flow',
  viewEditor: 'view:editor',
  viewToggleSourceBin: 'view:toggle-source-bin',
  viewToggleInspector: 'view:toggle-inspector',
  timelineSelect: 'timeline:select',
  timelineCut: 'timeline:cut',
  timelineSlip: 'timeline:slip',
  timelineHand: 'timeline:hand',
  timelineSnap: 'timeline:snap',
  timelineAddKeyframe: 'timeline:add-keyframe',
  timelinePreviousKeyframe: 'timeline:previous-keyframe',
  timelineNextKeyframe: 'timeline:next-keyframe',
  helpProjectDocumentation: 'help:project-documentation',
  helpTutorial: 'help:tutorial',
  helpFeatureHelp: 'help:feature-help',
  helpKeyboardShortcuts: 'help:keyboard-shortcuts',
  helpAbout: 'help:about',
});

function commandItem(label, command, sendCommand, extra = {}) {
  return {
    label,
    click: () => sendCommand(command),
    ...extra,
  };
}

function createApplicationMenuTemplate({ appName, isMac = false, sendCommand }) {
  const template = [
    {
      label: 'File',
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
        { type: 'separator' },
        commandItem('Export Portable Project...', SIGNAL_LOOM_MENU_COMMANDS.fileExportProjectJson, sendCommand),
        commandItem('Export Assets...', SIGNAL_LOOM_MENU_COMMANDS.fileExportAssets, sendCommand),
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        commandItem('Undo', SIGNAL_LOOM_MENU_COMMANDS.editUndo, sendCommand, {
          accelerator: 'CommandOrControl+Z',
        }),
        commandItem('Redo', SIGNAL_LOOM_MENU_COMMANDS.editRedo, sendCommand, {
          accelerator: 'CommandOrControl+Shift+Z',
        }),
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        commandItem('Delete', SIGNAL_LOOM_MENU_COMMANDS.editDelete, sendCommand, {
          accelerator: 'Delete',
        }),
        { type: 'separator' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        commandItem('Flow Workspace', SIGNAL_LOOM_MENU_COMMANDS.viewFlow, sendCommand, {
          accelerator: 'CommandOrControl+1',
        }),
        commandItem('Editor Workspace', SIGNAL_LOOM_MENU_COMMANDS.viewEditor, sendCommand, {
          accelerator: 'CommandOrControl+2',
        }),
        { type: 'separator' },
        commandItem('Toggle Source Bin', SIGNAL_LOOM_MENU_COMMANDS.viewToggleSourceBin, sendCommand),
        commandItem('Toggle Inspector', SIGNAL_LOOM_MENU_COMMANDS.viewToggleInspector, sendCommand),
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'reload' },
      ],
    },
    {
      label: 'Timeline',
      submenu: [
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

  if (isMac) {
    return [
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
    ];
  }

  return template;
}

module.exports = {
  SIGNAL_LOOM_MENU_COMMANDS,
  createApplicationMenuTemplate,
};
