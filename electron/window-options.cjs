const FLOATING_PANEL_FRAME_NAME_PREFIX = 'signal-loom-';

function isSignalLoomFloatingPanelWindow(details = {}) {
  const frameName = typeof details.frameName === 'string' ? details.frameName : '';
  const features = typeof details.features === 'string' ? details.features : '';

  return (
    frameName.startsWith(FLOATING_PANEL_FRAME_NAME_PREFIX) ||
    (features.includes('popup=yes') && features.includes('frame=false'))
  );
}

function buildFloatingPanelWindowOpenResult(parentWindow) {
  return {
    action: 'allow',
    overrideBrowserWindowOptions: {
      parent: parentWindow,
      modal: false,
      show: true,
      frame: false,
      backgroundColor: '#08111d',
      skipTaskbar: false,
    },
  };
}

function buildDeniedWindowOpenResult() {
  return { action: 'deny' };
}

function buildWorkspaceWindowOpenResult(details, parentWindow) {
  return isSignalLoomFloatingPanelWindow(details)
    ? buildFloatingPanelWindowOpenResult(parentWindow)
    : buildDeniedWindowOpenResult();
}

function focusFloatingPanelChildWindow(parentWindow, childWindow) {
  if (!childWindow || childWindow.isDestroyed?.()) {
    return;
  }

  if (typeof childWindow.setParentWindow === 'function') {
    childWindow.setParentWindow(parentWindow);
  }

  if (childWindow.isMinimized?.()) {
    childWindow.restore?.();
  }

  childWindow.show?.();
  childWindow.moveTop?.();
  childWindow.focus?.();
}

module.exports = {
  buildFloatingPanelWindowOpenResult,
  buildWorkspaceWindowOpenResult,
  focusFloatingPanelChildWindow,
  isSignalLoomFloatingPanelWindow,
};
