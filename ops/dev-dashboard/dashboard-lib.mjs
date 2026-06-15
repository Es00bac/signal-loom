import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const DEFAULT_DASHBOARD_HOST = '127.0.0.1';
export const DEFAULT_DASHBOARD_PORT = 7890;

export function buildDashboardModel({ rootDir = process.cwd(), now = new Date() } = {}) {
  const taskListPath = join(rootDir, 'docs', 'TASK_LIST.md');
  const notesDir = join(rootDir, 'docs', 'notes');
  const parityPath = join(rootDir, 'src', 'components', 'ImageEditor', 'ImagePhotoshopParity.ts');
  const tasks = parseTaskList(readOptionalFile(taskListPath));
  const paritySource = readOptionalFile(parityPath);
  const telemetry = collectDashboardTelemetry(rootDir);
  const imageParity = parseImageParity(paritySource, tasks, { rootDir, telemetry });
  const imageCapabilities = buildImageCapabilities(paritySource);
  const imageParityRun = buildImageParityRun(paritySource, imageParity, telemetry.imageParityWorkers);

  return {
    generatedAt: now.toISOString(),
    host: DEFAULT_DASHBOARD_HOST,
    port: DEFAULT_DASHBOARD_PORT,
    tasks,
    notes: readRecentNotes(notesDir),
    imageParity,
    imageCapabilities,
    imageParityRun,
    goalProgress: calculateGoalProgress(tasks, imageParity),
    telemetry,
  };
}

export function renderDashboardHtml(model) {
  const remainingCurrent = model.tasks.currentStatus.remaining;
  const completedCurrent = model.tasks.currentStatus.completed;
  const allRemaining = model.tasks.all.remaining;
  const parity = model.imageParity;
  const goal = model.goalProgress;
  const initialStatusSignature = dashboardStableSignature(model);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Signal Loom Development Dashboard</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #080b12;
      --panel: #101722;
      --panel-2: #131e2c;
      --line: rgba(79, 208, 255, 0.22);
      --text: rgba(226, 246, 255, 0.92);
      --muted: rgba(180, 218, 230, 0.62);
      --cyan: #18d4ff;
      --amber: #ffd166;
      --green: #8dffb1;
      --red: #ff8a9a;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: radial-gradient(circle at top left, rgba(24, 212, 255, 0.08), transparent 34rem), var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }
    header {
      position: sticky;
      top: 0;
      z-index: 2;
      border-bottom: 1px solid var(--line);
      background: rgba(8, 11, 18, 0.92);
      backdrop-filter: blur(14px);
    }
    .wrap { max-width: 1440px; margin: 0 auto; padding: 18px 22px; }
    .title-row { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 20px; font-weight: 800; }
    .subtle { color: var(--muted); font-size: 12px; }
    .grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(340px, 0.75fr); gap: 16px; }
    .cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 16px 0; }
    .card, .panel {
      border: 1px solid var(--line);
      background: linear-gradient(180deg, rgba(19, 30, 44, 0.96), rgba(11, 16, 25, 0.96));
      border-radius: 8px;
      box-shadow: 0 18px 50px rgba(0, 0, 0, 0.28);
    }
    .card { padding: 14px; min-height: 88px; }
    .card strong { display: block; font-size: 28px; line-height: 1; margin-top: 8px; }
    .panel { padding: 14px; min-height: 0; }
    .panel h2 { font-size: 13px; text-transform: uppercase; color: var(--cyan); margin-bottom: 10px; }
    ol, ul { margin: 0; padding-left: 20px; }
    li { margin: 7px 0; color: var(--muted); line-height: 1.35; }
    .task-done { color: rgba(141, 255, 177, 0.78); }
    .task-open { color: rgba(255, 209, 102, 0.92); }
    .note { display: block; padding: 9px 0; border-top: 1px solid rgba(79, 208, 255, 0.12); }
    .note:first-child { border-top: 0; padding-top: 0; }
    .note b { display: block; font-size: 13px; }
    .note span { color: var(--muted); font-size: 11px; }
    .pill-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    .pill { border: 1px solid var(--line); border-radius: 999px; padding: 5px 8px; color: var(--muted); font-size: 12px; }
    .progress { margin: 10px 0 12px; }
    .progress-top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
    .progress-title { color: var(--text); font-size: 12px; font-weight: 700; }
    .progress-value { color: var(--amber); font-size: 12px; font-weight: 800; }
    .progress-track { height: 10px; overflow: hidden; border-radius: 999px; border: 1px solid rgba(79, 208, 255, 0.2); background: rgba(3, 8, 14, 0.82); }
    .progress-fill { height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--cyan), var(--green)); box-shadow: 0 0 18px rgba(24, 212, 255, 0.3); }
    .green { color: var(--green); }
    .amber { color: var(--amber); }
    .red { color: var(--red); }
    .tabs { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 12px; }
    .tab-button {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(16, 23, 34, 0.94);
      color: var(--muted);
      cursor: pointer;
      font: inherit;
      font-size: 12px;
      font-weight: 800;
      padding: 8px 10px;
    }
    .tab-button[aria-selected="true"] {
      border-color: rgba(24, 212, 255, 0.62);
      color: var(--text);
      background: rgba(24, 212, 255, 0.12);
    }
    .tab-panel[hidden] { display: none; }
    .table-wrap { max-height: none; overflow: visible; border: 1px solid rgba(79, 208, 255, 0.16); border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; min-width: 980px; }
    th, td { border-bottom: 1px solid rgba(79, 208, 255, 0.12); padding: 9px 10px; text-align: left; vertical-align: top; }
    th { position: sticky; top: 0; z-index: 1; background: #101722; color: var(--cyan); font-size: 11px; text-transform: uppercase; }
    td { color: var(--muted); font-size: 12px; line-height: 1.35; }
    .feature-cell b { display: block; color: var(--text); margin-bottom: 3px; }
    .feature-cell span { color: rgba(180, 218, 230, 0.48); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
    .progress-cell { min-width: 140px; }
    .progress-cell .progress { margin: 0; }
    .progress-cell .progress-track { height: 8px; }
    .checklist-cell { min-width: 320px; overflow: visible; }
    .parity-row[data-worker-active="true"] td {
      box-shadow: inset 0 2px 0 var(--worker-color, var(--cyan)), inset 0 -2px 0 var(--worker-color, var(--cyan));
      background: rgba(24, 212, 255, 0.045);
    }
    .parity-row[data-worker-active="true"] td:first-child {
      box-shadow: inset 2px 0 0 var(--worker-color, var(--cyan)), inset 0 2px 0 var(--worker-color, var(--cyan)), inset 0 -2px 0 var(--worker-color, var(--cyan));
    }
    .parity-row[data-worker-active="true"] td:last-child {
      box-shadow: inset -2px 0 0 var(--worker-color, var(--cyan)), inset 0 2px 0 var(--worker-color, var(--cyan)), inset 0 -2px 0 var(--worker-color, var(--cyan));
    }
    .worker-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
    .worker-chip {
      border: 1px solid var(--worker-color, var(--line));
      border-radius: 999px;
      color: var(--text);
      background: rgba(255, 255, 255, 0.04);
      font-size: 10px;
      font-weight: 800;
      padding: 3px 6px;
    }
    .feature-checklist {
      min-width: 250px;
      max-height: none;
      overflow: visible;
    }
    .feature-checklist-title {
      margin: 0 0 7px;
      color: var(--text);
      font-weight: 800;
      list-style-position: inside;
    }
    .checklist-method { margin: 5px 0 7px; }
    .checklist-items { list-style: none; padding: 0; margin: 0; max-height: none; overflow: visible; }
    .checklist-items li { display: flex; align-items: flex-start; gap: 6px; margin: 5px 0; }
    .check {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 16px;
      width: 16px;
      height: 16px;
      border-radius: 4px;
      font-size: 11px;
      line-height: 1;
      font-weight: 900;
    }
    .check.yes { background: rgba(141, 255, 177, 0.14); color: var(--green); border: 1px solid rgba(141, 255, 177, 0.5); }
    .check.no { background: rgba(255, 138, 154, 0.12); color: var(--red); border: 1px solid rgba(255, 138, 154, 0.45); }
    @media (max-width: 980px) {
      .grid, .cards { grid-template-columns: 1fr; }
      .title-row { align-items: flex-start; flex-direction: column; }
    }
  </style>
</head>
<body data-auto-refresh-status="enabled" data-dashboard-poll-interval-ms="1000">
  <div data-dashboard-live-root>
    <header>
      <div class="wrap title-row">
        <div>
          <h1>Signal Loom Development Dashboard</h1>
          <p class="subtle">Live project status from docs and Image parity checklist. Open at localhost:${escapeHtml(String(model.port))}.</p>
        </div>
        <p class="subtle">Updated ${escapeHtml(formatDateTime(model.generatedAt))}</p>
      </div>
    </header>
    <main class="wrap">
      <section class="cards" aria-label="Status summary">
        ${metricCard('Open Current Tasks', remainingCurrent.length, 'amber')}
        ${metricCard('Completed Current Tasks', completedCurrent.length, 'green')}
        ${metricCard('Goal Progress', `${goal.percent}%`, goal.percent >= 90 ? 'green' : 'amber')}
        ${metricCard('Image Parity Progress', `${parity.parityProgressPercent}%`, parity.parityProgressPercent >= 80 ? 'green' : 'amber')}
      </section>
      <nav class="tabs" role="tablist" aria-label="Dashboard sections">
        <button class="tab-button" id="tab-overview" role="tab" type="button" aria-selected="true" aria-controls="panel-overview" data-tab-target="overview">Overview</button>
        <button class="tab-button" id="tab-parity-run" role="tab" type="button" aria-selected="false" aria-controls="panel-parity-run" data-tab-target="parity-run">Image Parity Run</button>
      </nav>
      <section class="tab-panel grid" id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" data-tab-panel="overview">
        <div class="panel">
          <h2>Current Task List</h2>
          ${progressPanelHtml('Goal Progress', goal.percent, `${goal.completed} completed / ${goal.remaining} open goal-scope tasks`)}
          ${taskListHtml('Open', remainingCurrent, 'task-open')}
          ${taskListHtml('Completed', completedCurrent, 'task-done')}
        </div>
        <div class="panel">
          <h2>Image Parity</h2>
          <p class="subtle">Checklist-grounded progress from ImagePhotoshopParity.ts. Progress is completed Boolean atoms divided by total Boolean atoms. A row at 100% is counted as done.</p>
          ${progressPanelHtml('Image Parity Progress', parity.parityProgressPercent, `${parity.parityProgressPercent}% checklist-backed parity progress across ${parity.trackedRows} tracked rows`)}
          ${progressPanelHtml('High Priority Parity', parity.highPriorityProgress, `${parity.highPriorityProgress}% checklist-backed parity progress across ${parity.highPriority} high priority rows`)}
          <div class="pill-row">
            <span class="pill green">${escapeHtml(String(parity.done))} done</span>
            <span class="pill amber">${escapeHtml(String(parity.partial))} partial</span>
            <span class="pill red">${escapeHtml(String(parity.remaining))} gaps</span>
            <span class="pill">${escapeHtml(String(parity.highPriority))} high priority</span>
            <span class="pill green">${escapeHtml(String(parity.completedImageTasks))} completed Image tasks</span>
            <span class="pill amber">${escapeHtml(String(parity.openImageTasks))} open Image tasks</span>
          </div>
        </div>
        <div class="panel">
          <h2>Image Capabilities</h2>
          <p class="subtle">${escapeHtml(String(model.imageCapabilities.highPriorityPartialOrRemaining))} high-priority partial/remaining rows need audit attention.</p>
          <div class="pill-row">
            <span class="pill amber">${escapeHtml(String(model.imageCapabilities.highPriorityPartial))} high partial</span>
            <span class="pill red">${escapeHtml(String(model.imageCapabilities.highPriorityRemaining))} high remaining</span>
            <span class="pill">${escapeHtml(String(model.imageCapabilities.total))} total capability rows</span>
          </div>
          ${imageCapabilityRowsHtml(model.imageCapabilities.topIncomplete)}
        </div>
        <div class="panel">
          <h2>Verification Telemetry</h2>
          ${telemetryHtml(model.telemetry)}
        </div>
        <div class="panel">
          <h2>Remaining Backlog</h2>
          ${taskListHtml('All Open Tasks', allRemaining.slice(0, 30), 'task-open')}
        </div>
        <div class="panel">
          <h2>Recent Notes</h2>
          ${model.notes.map((note) => `
            <a class="note" href="/notes/${encodeURIComponent(note.fileName)}">
              <b>${escapeHtml(note.title)}</b>
              <span>${escapeHtml(note.fileName)}</span>
            </a>
          `).join('') || '<p class="subtle">No notes found.</p>'}
        </div>
      </section>
      <section class="tab-panel" id="panel-parity-run" role="tabpanel" aria-labelledby="tab-parity-run" data-tab-panel="parity-run" hidden>
        <div class="panel">
          <h2>Feature Plan Progress</h2>
          <p class="subtle">Every feature planned for the current Image parity run, sourced from ImagePhotoshopParity.ts. Progress and status are calculated only from completed Boolean checklist atoms divided by total checklist atoms.</p>
          ${progressPanelHtml('Parity Run Average', model.imageParityRun.averageProgress, `${model.imageParityRun.total} planned feature rows`)}
          ${imageParityRunTableHtml(model.imageParityRun.features)}
        </div>
      </section>
    </main>
  </div>
  <script>
    const dashboardTabStorageKey = 'signal-loom-dashboard-active-tab';

    function selectDashboardTab(target) {
      if (!target) return;
      for (const candidate of document.querySelectorAll('[data-tab-target]')) {
        candidate.setAttribute('aria-selected', String(candidate.getAttribute('data-tab-target') === target));
      }
      for (const panel of document.querySelectorAll('[data-tab-panel]')) {
        panel.hidden = panel.getAttribute('data-tab-panel') !== target;
      }
    }

    function bindDashboardTabs() {
      for (const button of document.querySelectorAll('[data-tab-target]')) {
        button.addEventListener('click', () => {
          const target = button.getAttribute('data-tab-target');
          sessionStorage.setItem(dashboardTabStorageKey, target || 'overview');
          selectDashboardTab(target);
        });
      }
    }

    bindDashboardTabs();
    selectDashboardTab(sessionStorage.getItem(dashboardTabStorageKey) || 'overview');

    const dashboardPollIntervalMs = 1000;
    let currentDashboardStatusSignature = '${escapeScriptString(initialStatusSignature)}';

    function dashboardStableSignature(status) {
      return JSON.stringify(status, (key, value) => {
        if (key === 'generatedAt') return undefined;
        return value;
      });
    }

    async function pollDashboardStatus() {
      try {
        const response = await fetch('/status.json', { cache: 'no-store' });
        if (!response.ok) return;
        const nextStatus = await response.json();
        if (dashboardStableSignature(nextStatus) !== currentDashboardStatusSignature) {
          await refreshDashboardDocument(nextStatus);
        }
      } catch (_error) {
        // Dashboard auto-refresh is opportunistic; leave the current view usable if polling fails.
      }
    }

    async function refreshDashboardDocument(nextStatus) {
      const htmlResponse = await fetch('/', { cache: 'no-store' });
      if (!htmlResponse.ok) return;
      const nextDocument = new DOMParser().parseFromString(await htmlResponse.text(), 'text/html');
      const currentRoot = document.querySelector('[data-dashboard-live-root]');
      const nextRoot = nextDocument.querySelector('[data-dashboard-live-root]');
      if (!currentRoot || !nextRoot) return;
      currentRoot.replaceWith(nextRoot);
      currentDashboardStatusSignature = dashboardStableSignature(nextStatus);
      bindDashboardTabs();
      selectDashboardTab(sessionStorage.getItem(dashboardTabStorageKey) || 'overview');
    }

    setInterval(pollDashboardStatus, dashboardPollIntervalMs);
    void pollDashboardStatus();
  </script>
</body>
</html>`;
}

export function parseTaskList(markdown) {
  const lines = markdown.split(/\r?\n/);
  const allTasks = [];
  const currentStatusLines = [];
  let inCurrentStatus = false;

  for (const line of lines) {
    if (/^##\s+Current Status\b/i.test(line)) {
      inCurrentStatus = true;
      continue;
    }
    if (inCurrentStatus && /^##\s+/.test(line)) {
      inCurrentStatus = false;
    }
    const task = parseTaskLine(line);
    if (!task) continue;
    allTasks.push(task);
    if (inCurrentStatus) currentStatusLines.push(task);
  }

  return {
    currentStatus: splitTasks(currentStatusLines),
    all: splitTasks(allTasks),
  };
}

export function parseImageParity(
  source,
  tasks = { currentStatus: { completed: [], remaining: [] } },
) {
  const rows = parseImageParityRows(source);
  const trackedRows = rows.length;
  const checklistRows = rows.map((row) => buildFeatureBooleanChecklist(row));
  const computedStatuses = rows.map((row, index) => deriveChecklistFeatureStatus(row, checklistRows[index]));
  const checklistAverage = trackedRows > 0
    ? roundPercent(checklistRows.reduce((sum, checklist) => sum + checklist.progressPercent, 0) / trackedRows)
    : 0;
  const highPriorityRows = rows.filter((row) => row.priority === 'high');
  const highPriorityChecklistAverage = highPriorityRows.length > 0
    ? roundPercent(highPriorityRows.reduce((sum, row) => sum + buildFeatureBooleanChecklist(row).progressPercent, 0) / highPriorityRows.length)
    : 0;
  const completedImageTasks = tasks.currentStatus.completed.filter(isImageGoalTask).length;
  const openImageTasks = tasks.currentStatus.remaining.filter(isImageGoalTask).length;

  return {
    done: computedStatuses.filter((status) => status === 'done').length,
    partial: computedStatuses.filter((status) => status === 'partial').length,
    remaining: computedStatuses.filter((status) => status === 'remaining').length,
    highPriority: countLiteral(source, "priority: 'high'"),
    trackedRows,
    checklistAverage,
    highPriorityChecklistAverage,
    parityProgressPercent: checklistAverage,
    highPriorityProgress: highPriorityChecklistAverage,
    completedImageTasks,
    openImageTasks,
  };
}

export function buildImageCapabilities(source) {
  const rows = parseImageParityRows(source)
    .map((row) => {
      const checklist = buildFeatureBooleanChecklist(row);
      return {
      id: row.id,
      area: row.area,
      status: deriveChecklistFeatureStatus(row, checklist),
      priority: row.priority,
      progressPercent: checklist.progressPercent,
      signalLoom: row.signalLoom,
      checklist,
      };
    });
  const highPriorityIncomplete = rows.filter((row) => (
    row.priority === 'high' && (row.status === 'partial' || row.status === 'remaining')
  ));
  const topIncomplete = rows
    .filter((row) => row.status !== 'done')
    .toSorted(compareIncompleteCapabilityRows)
    .slice(0, 8);

  return {
    rows,
    total: rows.length,
    highPriorityPartialOrRemaining: highPriorityIncomplete.length,
    highPriorityPartial: highPriorityIncomplete.filter((row) => row.status === 'partial').length,
    highPriorityRemaining: highPriorityIncomplete.filter((row) => row.status === 'remaining').length,
    topIncomplete,
  };
}

export function buildImageParityRun(source, imageParity, workerTelemetry = null) {
  const workerAssignments = indexImageParityWorkers(workerTelemetry);
  const features = parseImageParityRows(source).map((row) => {
    const checklist = buildFeatureBooleanChecklist(row);
    const status = deriveChecklistFeatureStatus(row, checklist);
    return {
      id: row.id,
      feature: row.area,
      objective: row.photoshop || row.workflowReason || row.area,
      status,
      priority: row.priority,
      progressPercent: checklist.progressPercent,
      currentState: row.signalLoom,
      checklist,
      workers: workerAssignments.get(row.id) ?? [],
    };
  });

  return {
    total: features.length,
    averageProgress: imageParity?.parityProgressPercent ?? 0,
    features,
  };
}

const CHECKLIST_PROGRESS_METHOD = 'completed Boolean atoms / total Boolean atoms';

function buildFeatureBooleanChecklist(row) {
  const objectiveAtoms = extractObjectiveAtoms(row);
  let completedLabels = row.status === 'remaining' ? [] : extractCompletedChecklistAtoms(row);
  let remainingLabels = row.status === 'done' ? [] : extractRemainingChecklistAtoms(row);

  if (row.status === 'done') {
    completedLabels = dedupeChecklistLabels([...completedLabels, ...objectiveAtoms]);
    remainingLabels = [];
  } else if (row.status === 'remaining') {
    completedLabels = [];
    remainingLabels = dedupeChecklistLabels([...remainingLabels, ...objectiveAtoms, row.area]);
  } else {
    const coveredLabels = [...completedLabels, ...remainingLabels];
    const uncoveredObjectives = objectiveAtoms.filter((atom) => !isChecklistAtomCovered(atom, coveredLabels));
    remainingLabels = dedupeChecklistLabels([...remainingLabels, ...uncoveredObjectives]);
    if (completedLabels.length === 0 && hasMeaningfulImplementedState(row.signalLoom)) {
      completedLabels = [row.area];
    }
    if (remainingLabels.length === 0 && completedLabels.length === 0) {
      remainingLabels = [`Complete remaining ${row.area} parity gaps`];
    }
  }

  completedLabels = dedupeChecklistLabels(completedLabels);
  remainingLabels = dedupeChecklistLabels(
    remainingLabels.filter((label) => !isChecklistAtomCovered(label, completedLabels)),
  );

  const items = [
    ...completedLabels.map((label, index) => checklistItem(row.id, label, true, index)),
    ...remainingLabels.map((label, index) => checklistItem(row.id, label, false, index)),
  ];
  const total = items.length;
  const completed = items.filter((item) => item.complete).length;
  const remaining = total - completed;

  return {
    method: CHECKLIST_PROGRESS_METHOD,
    total,
    completed,
    remaining,
    progressPercent: total > 0 ? roundPercent((completed / total) * 100) : 0,
    items,
  };
}

function deriveChecklistFeatureStatus(row, checklist) {
  if (checklist?.total > 0 && checklist.remaining === 0) return 'done';
  if (row.status === 'done') return 'done';
  if (row.status === 'remaining') return 'remaining';
  return 'partial';
}

function checklistItem(featureId, label, complete, index) {
  return {
    id: `${featureId}:${complete ? 'done' : 'open'}:${index + 1}`,
    label: toChecklistLabel(label),
    complete,
  };
}

function extractObjectiveAtoms(row) {
  return dedupeChecklistLabels(atomizeChecklistText(row.photoshop || row.workflowReason || row.area));
}

function extractCompletedChecklistAtoms(row) {
  const segments = splitChecklistSegments(row.signalLoom)
    .filter((segment) => segment.length > 0)
    .filter((segment) => !isRemainingChecklistSegment(segment));
  const phrases = segments.flatMap(splitChecklistPhrases);
  return dedupeChecklistLabels(atomizeChecklistText(phrases.join(', ')));
}

function extractRemainingChecklistAtoms(row) {
  const segments = splitChecklistSegments(row.signalLoom)
    .filter(isRemainingChecklistSegment)
    .map(cleanRemainingChecklistSegment);
  const phrases = segments.flatMap(splitChecklistPhrases);
  const atoms = atomizeChecklistText(phrases.join(', '));
  if (row.status === 'remaining' && atoms.length === 0) {
    return extractObjectiveAtoms(row);
  }
  return dedupeChecklistLabels(atoms);
}

function splitChecklistSegments(text) {
  return String(text ?? '')
    .split(/\s*;\s*|\.\s+(?=[A-Z])|\s+\b(?:but|while|yet)\b\s+/i)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function splitChecklistPhrases(text) {
  return String(text ?? '')
    .split(/\s*,\s*|\s+\b(?:and|plus)\b\s+/i)
    .map((segment) => toChecklistLabel(segment))
    .filter((segment) => segment.length > 0);
}

function isRemainingChecklistSegment(segment) {
  const lower = segment.toLowerCase();
  if (/\b(exist|exists|now exist|now exists|has|have|ready|records?|support|supports|available|implemented|handles?|captures?|detected|rejected|expose|exposes)\b/.test(lower)
    && /\b(warnings?|metadata|descriptors?|readiness|policy|policies|summaries|caveats?|signatures?|blockers?|unsupported-state)\b/.test(lower)
    && !/\b(remain|remains|remaining|still|incomplete|not implemented|unavailable)\b/.test(lower)) {
    return false;
  }
  if (/\b(unsupported|missing|limitation|caveat|warning|warnings|metadata|descriptor|descriptors)\b.+\b(exist|exists|now exist|now exists|support|supports)\b/.test(lower)) {
    return false;
  }
  if (/\b(unsupported|missing|remaining|still|lag|lags|incomplete|not implemented|unavailable|caveat|caveats|limitation|limitations|warning|warnings|blocker|blockers)\b/.test(lower)
    && !/\b(can|include|includes|included|has|have|keeps?|persists?|renders?|switches?|covers?|exist|exists|support|supports|available|implemented|handles?|captures?|detected|rejected|expose|exposes|descriptions?|signatures?)\b/.test(lower)) {
    return true;
  }
  if (/\b(no dock button|no wasted area|no excess|zero icon gap|without covering|excluded from tab targets|excludes? from tab targets)\b/.test(lower)
    && /\b(exist|exists|fixed|palette|toolbar|renders?|keeps?|excluded|excludes?|without|zero)\b/.test(lower)) {
    return false;
  }
  if (/\b(warnings?|metadata|descriptors?|readiness|policy|policies|summaries|caveats?|signatures?)\b/.test(lower)
    && /\b(can|include|includes|included|has|have|keeps?|persists?|renders?|switches?|covers?|exist|exists|support|supports|available|implemented|handles?|captures?|detected|rejected|expose|exposes|descriptions?)\b/.test(lower)
    && !/\b(no|remain|remains|still|missing|not implemented|lag|lags|incomplete)\b/.test(lower)) {
    return false;
  }
  if (/\b(can|include|includes|included|has|have|keeps?|persists?|renders?|switches?|covers?|exist|exists|now exist|now exists|support|supports|available|implemented|handles?|captures?|detected|rejected|expose|exposes|descriptions?|signatures?)\b/.test(lower)
    && !/\b(no|remain|remains|still|missing|not implemented|unavailable|lag|lags|incomplete)\b/.test(lower)) {
    return false;
  }
  return /\b(no|remain|remains|remaining|still|missing|not implemented|unavailable|lag|lags|incomplete|unsupported)\b/.test(lower);
}

function cleanRemainingChecklistSegment(segment) {
  return segment
    .replace(/\b(no|still|remain|remains|remaining|are|is)\b/gi, ' ')
    .replace(/\bunsupported-[\w-]+\b/gi, ' ')
    .replace(/\bunsupported\s+state\b/gi, ' ')
    .replace(/\b(missing|incomplete|unavailable|unsupported|not implemented|lag badly|lags badly|lag|lags)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function atomizeChecklistText(text) {
  return String(text ?? '')
    .replace(/`/g, '')
    .replace(/\b(now|already|currently|basic|first-class|real|direct|dedicated|persisted|deterministic)\b/gi, ' ')
    .replace(/\b(exist|exists|available|implemented|support|supports|now support|now supports|now exist|now exists)\b/gi, ' ')
    .split(/\s*,\s*|\s+\band\b\s+|\s+\bplus\b\s+/i)
    .map(toChecklistLabel)
    .filter((label) => label.length >= 3 && !/^(but|with|without|or|and)$/i.test(label))
    .filter((label) => isChecklistAtomConcrete(label));
}

function toChecklistLabel(label) {
  return String(label ?? '')
    .replace(/\bunsupported-state\b/gi, 'unsupported')
    .replace(/\bunsupported\s+state\s+(descriptors?|metadata|warnings?|caveats?)\b/gi, 'unsupported $1')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/^[\s,.;:()\-\+]+|[\s,.;:()\-\+]+$/g, '')
    .replace(/^(and|or)\s+/i, '')
    .trim();
}

function isChecklistAtomConcrete(label) {
  const normalized = normalizeChecklistAtom(label);
  return normalized.length > 0 && !normalized.every((token) => CHECKLIST_NOISE_TOKENS.has(token));
}

const CHECKLIST_NOISE_TOKENS = new Set([
  'descriptor',
  'descriptors',
  'state',
  'caveat',
  'caveats',
  'warning',
  'warnings',
  'limitation',
  'limitations',
  'blocker',
  'blockers',
]);

function dedupeChecklistLabels(labels) {
  const seen = new Set();
  const result = [];
  for (const label of labels.map(toChecklistLabel).filter(Boolean)) {
    const key = normalizeChecklistAtom(label).join(' ');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(label);
  }
  return result;
}

function isChecklistAtomCovered(atom, labels) {
  const atomTokens = normalizeChecklistAtom(atom);
  if (atomTokens.length === 0) return true;
  return labels.some((label) => {
    const labelTokens = normalizeChecklistAtom(label);
    if (labelTokens.length === 0) return false;
    const overlap = atomTokens.filter((token) => labelTokens.includes(token)).length;
    return overlap >= Math.max(1, Math.ceil(atomTokens.length * 0.6))
      || labelTokens.join(' ').includes(atomTokens.join(' '))
      || atomTokens.join(' ').includes(labelTokens.join(' '));
  });
}

function normalizeChecklistAtom(value) {
  const stopWords = new Set([
    'a', 'an', 'and', 'are', 'as', 'be', 'for', 'from', 'in', 'into', 'is', 'it',
    'of', 'on', 'or', 'plus', 'the', 'to', 'true', 'with', 'without', 'workflow',
    'workflows', 'tool', 'tools', 'control', 'controls', 'mode', 'modes',
  ]);
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !stopWords.has(token))
    .map(normalizeChecklistToken);
}

function normalizeChecklistToken(token) {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

function hasMeaningfulImplementedState(value) {
  const text = String(value ?? '').trim();
  return text.length > 0 && !/^(missing|none|not implemented|unsupported)$/i.test(text);
}

function indexImageParityWorkers(workerTelemetry) {
  const byFeature = new Map();
  const workers = Array.isArray(workerTelemetry?.workers) ? workerTelemetry.workers : [];
  for (const worker of workers) {
    for (const featureId of worker.featureIds ?? []) {
      if (!byFeature.has(featureId)) byFeature.set(featureId, []);
      byFeature.get(featureId).push(worker);
    }
  }
  return byFeature;
}

export function calculateGoalProgress(tasks, imageParity = { parityProgressPercent: 0 }) {
  const goalTasks = [
    ...tasks.currentStatus.completed,
    ...tasks.currentStatus.remaining,
  ].filter(isGoalScopeTask);
  const completed = goalTasks.filter((task) => task.done).length;
  const remaining = goalTasks.length - completed;
  const total = goalTasks.length;
  return {
    completed,
    remaining,
    total,
    percent: imageParity.parityProgressPercent ?? 0,
  };
}

function parseImageParityRows(source) {
  if (!source) return [];
  const objectMatches = source.match(/\{[\s\S]*?\}/g) ?? [];
  return objectMatches
    .map((entry) => {
      const id = readObjectStringLiteral(entry, 'id');
      const area = readObjectStringLiteral(entry, 'area');
      const photoshop = readObjectStringValue(entry, 'photoshop');
      const signalLoom = readObjectStringValue(entry, 'signalLoom');
      const workflowReason = readObjectStringValue(entry, 'workflowReason');
      const status = entry.match(/status:\s*'([^']+)'/)?.[1];
      const priority = entry.match(/priority:\s*'([^']+)'/)?.[1];
      if (!status || !priority) return null;
      return {
        id: id ?? 'unknown',
        area: area ?? 'Unknown',
        photoshop: photoshop ?? '',
        signalLoom: signalLoom ?? '',
        workflowReason: workflowReason ?? '',
        status,
        priority,
      };
    })
    .filter(Boolean);
}

function readObjectStringLiteral(entry, key) {
  const match = entry.match(new RegExp(`${key}:\\s*'((?:\\\\'|[^'])*)'`));
  return match ? match[1].replaceAll("\\'", "'") : null;
}

function readObjectStringValue(entry, key) {
  const literal = readObjectStringLiteral(entry, key);
  if (literal !== null) return literal;

  const arrayJoinMatch = entry.match(
    new RegExp(`${key}:\\s*\\[([\\s\\S]*?)\\]\\s*\\.join\\(\\s*'((?:\\\\'|[^'])*)'\\s*\\)`),
  );
  if (!arrayJoinMatch) return null;

  const values = [];
  const stringLiteralPattern = /'((?:\\'|[^'])*)'/g;
  let match = stringLiteralPattern.exec(arrayJoinMatch[1]);
  while (match) {
    values.push(match[1].replaceAll("\\'", "'"));
    match = stringLiteralPattern.exec(arrayJoinMatch[1]);
  }

  return values.join(arrayJoinMatch[2].replaceAll("\\'", "'"));
}

function compareIncompleteCapabilityRows(a, b) {
  return priorityRank(a.priority) - priorityRank(b.priority)
    || a.progressPercent - b.progressPercent
    || a.area.localeCompare(b.area)
    || a.id.localeCompare(b.id);
}

function priorityRank(priority) {
  if (priority === 'high') return 0;
  if (priority === 'medium') return 1;
  if (priority === 'low') return 2;
  return 3;
}

function roundPercent(value) {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function isImageGoalTask(task) {
  return /\b(image|photoshop|gimp)\b/i.test(task.text);
}

function isGoalScopeTask(task) {
  return /\b(image|photoshop|gimp|android accelerator|upscal|color picker|workspace launch|icon|dashboard progress)\b/i.test(task.text);
}

export function collectDashboardTelemetry(rootDir = process.cwd()) {
  return {
    build: artifactStatus(rootDir, 'dist/index.html'),
    androidSync: artifactStatus(rootDir, 'android/app/src/main/assets/public/index.html'),
    androidLaunchSplash: collectJsonArtifact(
      rootDir,
      'ops/dev-dashboard/artifacts/android-launch-splash-latest.json',
      summarizeAndroidLaunchSplashReport,
    ),
    playwright: collectPlaywrightTelemetry(rootDir),
    nativeSoak: collectLatestJsonReport(
      rootDir,
      join(rootDir, 'output', 'native-real-project-soak'),
      'real-project-soak-report.json',
      summarizeNativeSoakReport,
    ),
    paperPdfParity: collectLatestJsonReport(
      rootDir,
      join(rootDir, 'output', 'native-paper-pdf-parity'),
      'paper-pdf-parity-report.json',
      summarizePaperPdfParityReport,
    ),
    androidImageSmoke: collectJsonArtifact(
      rootDir,
      'ops/dev-dashboard/artifacts/android-image-smoke-latest.json',
      summarizeAndroidImageSmokeReport,
    ),
    androidDex4kDisplay: collectJsonArtifact(
      rootDir,
      'ops/dev-dashboard/artifacts/android-dex-4k-display-latest.json',
      summarizeAndroidDex4kDisplayReport,
    ),
    androidDexImageWorkspace: collectJsonArtifact(
      rootDir,
      'ops/dev-dashboard/artifacts/android-dex-image-workspace-latest.json',
      summarizeAndroidDexImageWorkspaceReport,
    ),
    androidDex1080pRestart: collectJsonArtifact(
      rootDir,
      'ops/dev-dashboard/artifacts/android-dex-1080p-restart-latest.json',
      summarizeAndroidDex1080pRestartReport,
    ),
    androidDex1080pOpenDocument: collectJsonArtifact(
      rootDir,
      'ops/dev-dashboard/artifacts/android-dex-1080p-open-document-latest.json',
      summarizeAndroidDex1080pOpenDocumentReport,
    ),
    androidDex1080pOpenDocumentEdit: collectJsonArtifact(
      rootDir,
      'ops/dev-dashboard/artifacts/android-dex-1080p-open-document-latest.json',
      summarizeAndroidDex1080pOpenDocumentEditReport,
    ),
    dockableTabUi: collectLatestJsonArtifact(
      rootDir,
      'ops/dev-dashboard/artifacts',
      /^dockable-tab-ui-.+\.json$/,
      'ops/dev-dashboard/artifacts/dockable-tab-ui-*.json',
      summarizeDockableTabUiReport,
    ),
    imageParityWorkers: collectJsonArtifact(
      rootDir,
      'ops/dev-dashboard/artifacts/image-parity-workers-latest.json',
      summarizeImageParityWorkersReport,
    ),
  };
}

function readRecentNotes(notesDir, limit = 8) {
  if (!existsSync(notesDir)) return [];
  return readdirSync(notesDir)
    .filter((fileName) => fileName.endsWith('.md'))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    .slice(0, limit)
    .map((fileName) => {
      const content = readOptionalFile(join(notesDir, fileName));
      return {
        fileName,
        title: extractMarkdownTitle(content) ?? fileName,
      };
    });
}

function readOptionalFile(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

function artifactStatus(rootDir, relativePath) {
  const artifactPath = join(rootDir, relativePath);
  if (!existsSync(artifactPath)) {
    return { available: false, path: relativePath };
  }

  const stats = statSync(artifactPath);
  return {
    available: true,
    path: relativePath,
    updatedAt: stats.mtime.toISOString(),
    bytes: stats.size,
  };
}

function collectPlaywrightTelemetry(rootDir) {
  const files = findFiles(join(rootDir, 'output', 'playwright'), (filePath) => (
    /\.(png|jpe?g|webp)$/i.test(filePath)
  ));
  const latest = latestByMtime(files);

  return {
    screenshotCount: files.length,
    latestScreenshot: latest ? fileArtifact(rootDir, latest) : null,
  };
}

function collectLatestJsonReport(rootDir, searchDir, fileName, summarize) {
  const latest = latestByMtime(findFiles(searchDir, (filePath) => filePath.endsWith(fileName)));
  if (!latest) {
    return { available: false, path: toRelativePath(rootDir, join(searchDir, fileName)) };
  }

  const artifact = fileArtifact(rootDir, latest);
  try {
    const report = JSON.parse(readFileSync(latest, 'utf8'));
    return {
      available: true,
      ...artifact,
      ok: report.ok !== false,
      ...summarize(report),
    };
  } catch (error) {
    return {
      available: true,
      ...artifact,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function collectJsonArtifact(rootDir, relativePath, summarize) {
  const artifactPath = join(rootDir, relativePath);
  if (!existsSync(artifactPath)) {
    return { available: false, path: relativePath };
  }

  const artifact = fileArtifact(rootDir, artifactPath);
  try {
    const report = JSON.parse(readFileSync(artifactPath, 'utf8'));
    return {
      available: true,
      ...artifact,
      ok: report.ok !== false,
      ...summarize(report, rootDir),
    };
  } catch (error) {
    return {
      available: true,
      ...artifact,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function collectLatestJsonArtifact(rootDir, relativeDir, filePattern, missingPath, summarize) {
  const searchDir = join(rootDir, relativeDir);
  const latest = latestByMtime(findFiles(searchDir, (filePath) => filePattern.test(filePath.split(/[\\/]+/).pop() ?? '')));
  if (!latest) {
    return { available: false, path: missingPath };
  }

  const artifact = fileArtifact(rootDir, latest);
  try {
    const report = JSON.parse(readFileSync(latest, 'utf8'));
    return {
      available: true,
      ...artifact,
      ok: true,
      ...summarize(report, rootDir),
    };
  } catch (error) {
    return {
      available: true,
      ...artifact,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function summarizeNativeSoakReport(report) {
  const workspaceWindows = Array.isArray(report.startup?.workspaceWindows)
    ? report.startup.workspaceWindows.length
    : undefined;
  const cycles = typeof report.soak?.cycles === 'number'
    ? report.soak.cycles
    : report.options?.soakCycles;

  return {
    sourceItems: report.startup?.sourceItems,
    paperPages: report.startup?.paperPages,
    workspaceWindows,
    cycles,
  };
}

function summarizePaperPdfParityReport(report) {
  return {
    requestedPages: Array.isArray(report.requestedPages) ? report.requestedPages : [],
    comparisonCount: Array.isArray(report.comparisons) ? report.comparisons.length : 0,
    pdfBytes: report.pdf?.bytes,
  };
}

function summarizeAndroidImageSmokeReport(report) {
  return {
    kind: report.kind,
    timestamp: report.timestamp,
    device: report.device?.model,
    serial: report.device?.serial,
    androidRelease: report.device?.androidRelease,
    apiLevel: report.device?.apiLevel,
    packageId: report.app?.packageId,
    installed: report.app?.installed,
    visible: report.app?.visible,
    pid: report.app?.pid,
    focusedActivity: report.app?.focusedActivity,
    readinessMovement: report.readinessAssessment?.androidReadinessMovement,
    strongEnoughToMoveAndroidReadiness: report.readinessAssessment?.strongEnoughToMoveAndroidReadiness,
    findingCount: Array.isArray(report.findings) ? report.findings.length : 0,
  };
}

function summarizeAndroidDex4kDisplayReport(report) {
  return {
    kind: report.kind,
    timestamp: report.timestamp,
    device: report.device?.model,
    serial: report.device?.serial,
    displayId: report.display?.displayId,
    logicalWidth: report.display?.logicalWidth,
    logicalHeight: report.display?.logicalHeight,
    densityDpi: report.display?.densityDpi,
    widthDp: report.display?.widthDp,
    heightDp: report.display?.heightDp,
    bottomNavigationInsetPx: report.display?.bottomNavigationInsetPx,
    readinessMovement: report.readinessAssessment?.androidReadinessMovement,
    strongEnoughToMoveAndroidReadiness: report.readinessAssessment?.strongEnoughToMoveAndroidReadiness,
  };
}

function summarizeAndroidDexImageWorkspaceReport(report, rootDir) {
  const findings = report.findings ?? {};
  const screenshotInspection = findings.visualScreenshotInspection ?? {};

  return {
    lane: report.lane,
    timestamp: report.generatedAt ?? report.timestamp,
    display: {
      id: findings.targetDisplayId,
      signalLoomAssociated: findings.signalLoomAssociatedWithDisplay9Heuristic,
      focused: findings.focusMentionsSignalLoom,
    },
    workspace: {
      packageName: findings.packageName,
      activity: findings.activity,
      imageWorkspaceEvidence: findings.imageWorkspaceEvidence,
    },
    screenshot: {
      captured: findings.screenshotCaptured,
      path: artifactPathFromReport(rootDir, findings.screenshotPath),
      resolution: findings.screenshotResolution,
      inspected: screenshotInspection.inspectedByAgent,
      summary: screenshotInspection.summary,
      caveat: screenshotInspection.caveat,
    },
    readiness: {
      assessment: findings.readinessAssessment,
      shouldMoveAndroidDexReadiness: findings.shouldMoveAndroidDexReadiness,
    },
  };
}

function summarizeAndroidLaunchSplashReport(report) {
  return {
    kind: report.kind,
    timestamp: report.timestamp,
    device: report.device?.model,
    serial: report.device?.serial,
    packageName: report.app?.packageName,
    activity: report.app?.activity,
    installed: report.app?.installed,
    pid: report.app?.pid,
    focused: report.app?.focused,
    launchState: report.launch?.state,
    totalTimeMs: report.launch?.totalTimeMs,
    waitTimeMs: report.launch?.waitTimeMs,
    display: {
      id: report.display?.logicalId,
      width: report.display?.width,
      height: report.display?.height,
      densityDpi: report.display?.densityDpi,
      surfaceFlingerDisplayId: report.display?.surfaceFlingerDisplayId,
    },
    splash: {
      sourceImage: report.splash?.sourceImage,
      nativeTheme: report.splash?.nativeTheme,
      bootOverlay: report.splash?.bootOverlay,
      screenshotCaptured: report.splash?.screenshotCaptured,
      screenshotPath: report.splash?.screenshotPath,
      screenshotResolution: report.splash?.screenshotResolution,
    },
    postLaunchScreenshot: report.postLaunch?.screenshotPath,
    caveatCount: Array.isArray(report.caveats) ? report.caveats.length : 0,
  };
}

function summarizeAndroidDex1080pRestartReport(report) {
  return {
    kind: report.kind,
    timestamp: report.timestamp,
    device: report.device?.model ?? report.deviceModel,
    serial: report.device?.serial ?? report.deviceSerial,
    packageName: report.packageName,
    activity: report.activity,
    display: {
      id: report.display?.id,
      name: report.display?.name,
      type: report.display?.type,
      width: report.display?.width,
      height: report.display?.height,
      densityDpi: report.display?.densityDpi,
      surfaceFlingerDisplayId: report.display?.surfaceFlingerDisplayId,
      primaryInDisplayTopology: report.display?.primaryInDisplayTopology,
      dexTaskbarVisible: report.display?.dexTaskbarVisible,
      focusedSignalLoomWindow: report.display?.focusedSignalLoomWindow,
    },
    workspace: {
      activeWorkspace: report.workspace?.activeWorkspace,
      imageWorkspaceEvidence: report.workspace?.imageWorkspaceEvidence,
      documentState: report.workspace?.documentState,
    },
    screenshot: {
      captured: report.screenshot?.captured,
      path: report.screenshot?.path,
      resolution: report.screenshot?.resolution,
      summary: report.screenshot?.visualAssessment,
    },
    restart: {
      forceStoppedPackage: report.restart?.forceStoppedPackage,
      normalLaunchUsed: report.restart?.normalLaunchUsed,
      directLaunchDisplayDenied: report.restart?.directLaunchDisplayAttempt?.ok === false,
      deniedDisplayId: report.restart?.directLaunchDisplayAttempt?.displayId,
    },
    caveatCount: Array.isArray(report.caveats) ? report.caveats.length : 0,
  };
}

function summarizeAndroidDex1080pOpenDocumentReport(report) {
  const currentSchema = report.workspaceEvidence ?? null;
  if (currentSchema) {
    const resolution = parseResolution(report.display?.currentExternalResolution);
    return {
      kind: report.kind ?? report.schemaVersion,
      timestamp: report.timestamp ?? report.createdAt,
      device: report.device?.model ?? report.deviceModel,
      serial: report.device?.serial ?? report.deviceSerial,
      packageName: report.packageName ?? report.app?.package,
      activity: report.activity ?? report.app?.activity,
      display: {
        id: report.display?.currentExternalDisplayId,
        name: report.display?.currentExternalDisplayName,
        type: Array.isArray(report.display?.currentExternalDisplayFlags)
          ? report.display.currentExternalDisplayFlags.join(', ')
          : undefined,
        width: resolution?.width,
        height: resolution?.height,
        densityDpi: report.display?.densityDpi,
        surfaceFlingerDisplayId: report.display?.surfaceFlingerDisplayIdForScreenshot,
        focusedSignalLoomWindow: typeof report.display?.focusedWindow === 'string'
          ? /signal[-\s]?loom|signalloom/i.test(report.display.focusedWindow)
          : undefined,
        originallyRequestedId: report.display?.originallyRequestedLogicalDisplayId,
        originallyRequestedName: report.display?.originallyRequestedDisplayName,
        originallyRequestedDenied: typeof report.display?.originallyRequestedOutcome === 'string'
          ? /denied|unknown display|disappeared/i.test(report.display.originallyRequestedOutcome)
          : undefined,
      },
      workspace: {
        activeWorkspace: currentSchema.workspace,
        imageWorkspaceEvidence: currentSchema.workspace === 'Image' || currentSchema.openedDocument === true,
        documentState: currentSchema.openedDocument ? 'blank-document-open' : 'no-document-open',
        documentTitle: currentSchema.documentTitle,
        documentSize: currentSchema.documentSize,
        creationToast: currentSchema.creationToast,
        activeLayerEvidence: currentSchema.activeLayerEvidence,
        createdThroughBlankCanvasDialog: currentSchema.createdThroughBlankCanvasDialog,
        visuallyPristineBlankCanvas: currentSchema.visuallyPristineBlankCanvas,
      },
      screenshot: {
        captured: Boolean(report.artifacts?.screenshot),
        path: report.artifacts?.screenshot,
        resolution: resolutionToString(parseResolution(report.artifacts?.screenshotIdentifyResult)) ?? report.artifacts?.screenshotIdentifyResult,
        sha256: report.artifacts?.screenshotSha256,
        summary: currentSchema.visualCaveat,
      },
      caveatCount: Array.isArray(report.caveats) ? report.caveats.length : 0,
    };
  }

  return {
    kind: report.kind,
    timestamp: report.timestamp,
    device: report.device?.model ?? report.deviceModel,
    serial: report.device?.serial ?? report.deviceSerial,
    packageName: report.packageName,
    activity: report.activity,
    display: {
      id: report.display?.id,
      name: report.display?.name,
      type: report.display?.type,
      width: report.display?.width,
      height: report.display?.height,
      densityDpi: report.display?.densityDpi,
      surfaceFlingerDisplayId: report.display?.surfaceFlingerDisplayId,
      focusedSignalLoomWindow: report.display?.focusedSignalLoomWindow,
    },
    workspace: {
      activeWorkspace: report.workspace?.activeWorkspace,
      imageWorkspaceEvidence: report.workspace?.imageWorkspaceEvidence,
      documentState: report.workspace?.documentState,
      documentTitle: report.workspace?.documentTitle,
      documentSize: report.workspace?.documentSize,
    },
    screenshot: {
      captured: report.screenshot?.captured,
      path: report.screenshot?.path,
      resolution: report.screenshot?.resolution,
      summary: report.screenshot?.visualAssessment,
    },
    caveatCount: Array.isArray(report.caveats) ? report.caveats.length : 0,
  };
}

function summarizeAndroidDex1080pOpenDocumentEditReport(report) {
  const openDocument = summarizeAndroidDex1080pOpenDocumentReport(report);
  const currentSchema = report.workspaceEvidence ?? null;
  const caveatText = [
    currentSchema?.visualCaveat,
    report.summary,
    ...(Array.isArray(report.caveats) ? report.caveats : []),
  ].filter((entry) => typeof entry === 'string' && entry.length > 0).join(' ');
  const openedDocument = Boolean(currentSchema?.openedDocument ?? openDocument.workspace?.documentState === 'blank-document-open');
  const visibleCanvasMutation = openedDocument
    && currentSchema?.visuallyPristineBlankCanvas === false
    && /\b(brush|mark|marks|paint|painted|stroke|strokes|non[-\s]?pristine|mutation|modified)\b/i.test(caveatText);

  return {
    kind: `${openDocument.kind ?? 'android-dex-1080p-open-document'}:edit-evidence`,
    timestamp: openDocument.timestamp,
    device: openDocument.device,
    serial: openDocument.serial,
    packageName: openDocument.packageName,
    activity: openDocument.activity,
    display: openDocument.display,
    workspace: {
      activeWorkspace: openDocument.workspace?.activeWorkspace,
      imageWorkspaceEvidence: openDocument.workspace?.imageWorkspaceEvidence,
      documentState: openDocument.workspace?.documentState,
      documentTitle: openDocument.workspace?.documentTitle,
      documentSize: openDocument.workspace?.documentSize,
    },
    editEvidence: {
      openedDocument,
      activeLayerEvidence: currentSchema?.activeLayerEvidence ?? openDocument.workspace?.activeLayerEvidence,
      visibleCanvasMutation,
      createdThroughBlankCanvasDialog: currentSchema?.createdThroughBlankCanvasDialog ?? openDocument.workspace?.createdThroughBlankCanvasDialog,
      evidenceLevel: visibleCanvasMutation ? 'opened-document-edit' : openedDocument ? 'opened-document-open-only' : 'none',
      caveat: currentSchema?.visualCaveat,
    },
    screenshot: openDocument.screenshot,
    caveatCount: openDocument.caveatCount,
  };
}

function summarizeDockableTabUiReport(report) {
  const viewports = Array.isArray(report.viewports) ? report.viewports : [];
  const maxWidthDelta = maxDefined(viewports.map((viewport) => tabGroupDimensionDelta(viewport.tabGroup, 'width')));
  const maxHeightDelta = maxDefined(viewports.map((viewport) => tabGroupDimensionDelta(viewport.tabGroup, 'height')));
  const screenshots = report.result?.screenshots && typeof report.result.screenshots === 'object'
    ? Object.values(report.result.screenshots)
    : [];

  return {
    kind: report.schema,
    timestamp: report.completedAt ?? report.createdAt,
    fixedToolPalettesHaveNoDockButton: report.result?.fixedToolPalettesHaveNoDockButton,
    tabGroupsPreserveStableDimensions: report.result?.tabGroupsPreserveStableDimensions,
    viewportCount: viewports.length,
    screenshotCount: screenshots.length,
    screenshots,
    maxWidthDelta,
    maxHeightDelta,
    toolPaletteWidths: viewports
      .map((viewport) => viewport.fixedToolPalette?.rect?.width)
      .filter((value) => Number.isFinite(value)),
    toolPaletteHeights: viewports
      .map((viewport) => viewport.fixedToolPalette?.rect?.height)
      .filter((value) => Number.isFinite(value)),
  };
}

function summarizeImageParityWorkersReport(report) {
  const workers = Array.isArray(report.workers)
    ? report.workers.map(normalizeImageParityWorker).filter(Boolean)
    : [];
  return {
    kind: report.kind,
    schemaVersion: report.schemaVersion,
    timestamp: report.updatedAt ?? report.generatedAt,
    activeCount: workers.filter((worker) => worker.status === 'active').length,
    workers,
  };
}

function normalizeImageParityWorker(worker) {
  if (!worker || typeof worker !== 'object') return null;
  const featureIds = Array.isArray(worker.featureIds)
    ? worker.featureIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  if (featureIds.length === 0) return null;
  const lane = typeof worker.lane === 'string' ? worker.lane.trim() : '';
  const agent = typeof worker.agent === 'string' ? worker.agent.trim() : '';
  const rawName = typeof worker.name === 'string' ? worker.name.trim() : '';
  const name = lane || rawName || agent || String(worker.id ?? 'worker').trim();
  return {
    id: String(worker.id ?? rawName ?? lane ?? agent ?? 'worker').trim(),
    name,
    lane: lane || undefined,
    agent: agent || undefined,
    color: sanitizeWorkerColor(worker.color),
    status: normalizeWorkerStatus(worker.status),
    task: typeof worker.task === 'string' ? worker.task : '',
    featureIds,
    updatedAt: typeof worker.updatedAt === 'string' ? worker.updatedAt : undefined,
  };
}

function normalizeWorkerStatus(status) {
  const normalized = String(status ?? '').toLowerCase();
  if (normalized === 'completed') return 'complete';
  if (normalized === 'errored' || normalized === 'error') return 'failed';
  if (['active', 'blocked', 'complete', 'failed', 'queued'].includes(normalized)) return normalized;
  return 'queued';
}

function sanitizeWorkerColor(color) {
  const value = String(color ?? '').trim();
  return /^#[0-9a-f]{6}$/i.test(value) ? value : '#18d4ff';
}

function tabGroupDimensionDelta(tabGroup, dimension) {
  if (!tabGroup) return undefined;
  const explicitKey = dimension === 'width' ? 'maxWidthDelta' : 'maxHeightDelta';
  if (Number.isFinite(tabGroup[explicitKey])) return tabGroup[explicitKey];
  const before = tabGroup.beforeRect?.[dimension];
  const after = tabGroup.afterMoveRect?.[dimension];
  if (Number.isFinite(before) && Number.isFinite(after)) {
    return Math.abs(after - before);
  }
  const measurements = Array.isArray(tabGroup.measurements) ? tabGroup.measurements : [];
  const dimensions = measurements
    .map((measurement) => measurement.hostRect?.[dimension])
    .filter((value) => Number.isFinite(value));
  if (dimensions.length < 2) return undefined;
  return Math.max(...dimensions) - Math.min(...dimensions);
}

function parseResolution(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/(\d+)\s*x\s*(\d+)/i);
  if (!match) return null;
  return {
    width: Number.parseInt(match[1], 10),
    height: Number.parseInt(match[2], 10),
  };
}

function resolutionToString(resolution) {
  if (!resolution) return undefined;
  return `${resolution.width}x${resolution.height}`;
}

function maxDefined(values) {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  return finiteValues.length ? Math.max(...finiteValues) : undefined;
}

function artifactPathFromReport(rootDir, path) {
  if (typeof path !== 'string' || path.length === 0) return undefined;
  const normalizedRoot = rootDir.split(/[\\/]+/).join('/');
  const normalizedPath = path.split(/[\\/]+/).join('/');
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`)
    ? toRelativePath(rootDir, path)
    : normalizedPath;
}

function findFiles(rootDir, predicate) {
  if (!existsSync(rootDir)) return [];
  const results = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile() && predicate(entryPath)) {
        results.push(entryPath);
      }
    }
  }

  return results;
}

function latestByMtime(paths) {
  return paths
    .map((path) => ({ path, mtimeMs: statSync(path).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.path ?? null;
}

function fileArtifact(rootDir, path) {
  const stats = statSync(path);
  return {
    path: toRelativePath(rootDir, path),
    updatedAt: stats.mtime.toISOString(),
    bytes: stats.size,
  };
}

function toRelativePath(rootDir, path) {
  return relative(rootDir, path).split(/[\\/]+/).join('/');
}

function parseTaskLine(line) {
  const match = line.match(/^\s*-\s+\[(x|X| )\]\s+(.+?)\s*$/);
  if (!match) return null;
  return {
    done: match[1].toLowerCase() === 'x',
    text: match[2].trim(),
  };
}

function splitTasks(tasks) {
  return {
    completed: tasks.filter((task) => task.done),
    remaining: tasks.filter((task) => !task.done),
  };
}

function extractMarkdownTitle(markdown) {
  const titleLine = markdown.split(/\r?\n/).find((line) => line.startsWith('# '));
  return titleLine ? titleLine.replace(/^#\s+/, '').trim() : null;
}

function countLiteral(source, literal) {
  if (!source) return 0;
  return source.split(literal).length - 1;
}

function metricCard(label, value, tone) {
  return `
    <div class="card">
      <span class="subtle">${escapeHtml(label)}</span>
      <strong class="${escapeHtml(tone)}">${escapeHtml(String(value))}</strong>
    </div>
  `;
}

function progressPanelHtml(label, percent, detail) {
  const clampedPercent = Math.max(0, Math.min(100, Number(percent) || 0));
  return `
    <div class="progress">
      <div class="progress-top">
        <span class="progress-title">${escapeHtml(label)}</span>
        <span class="progress-value">${escapeHtml(String(clampedPercent))}%</span>
      </div>
      <div class="progress-track" aria-label="${escapeHtml(label)} progress">
        <div class="progress-fill" style="width: ${escapeHtml(String(clampedPercent))}%"></div>
      </div>
      <p class="subtle">${escapeHtml(detail)}</p>
    </div>
  `;
}

function telemetryHtml(telemetry) {
  const rows = [
    artifactTelemetryRow('Build artifact', telemetry.build),
    artifactTelemetryRow('Android web sync', telemetry.androidSync),
    telemetry.androidLaunchSplash.available
      ? `Android launch splash: ${statusWord(telemetry.androidLaunchSplash.ok)} ${telemetry.androidLaunchSplash.path}${stringDetail('device', telemetry.androidLaunchSplash.device)}${stringDetail('package', telemetry.androidLaunchSplash.packageName)}${stringDetail('launch', telemetry.androidLaunchSplash.launchState)}${numberDetail('launch ms', telemetry.androidLaunchSplash.totalTimeMs)}${displaySizeDetail(telemetry.androidLaunchSplash.display)}${booleanDetail('focused', telemetry.androidLaunchSplash.focused)}${booleanDetail('native theme', telemetry.androidLaunchSplash.splash?.nativeTheme)}${booleanDetail('boot overlay', telemetry.androidLaunchSplash.splash?.bootOverlay)}${screenshotDetail({ captured: telemetry.androidLaunchSplash.splash?.screenshotCaptured, resolution: telemetry.androidLaunchSplash.splash?.screenshotResolution })}`
      : 'Android launch splash: no report found',
    telemetry.playwright.latestScreenshot
      ? `Playwright: ${telemetry.playwright.screenshotCount} screenshots, latest ${telemetry.playwright.latestScreenshot.path}`
      : `Playwright: ${telemetry.playwright.screenshotCount} screenshots`,
    telemetry.nativeSoak.available
      ? `Native soak: ${statusWord(telemetry.nativeSoak.ok)} ${telemetry.nativeSoak.path}${numberDetail('source items', telemetry.nativeSoak.sourceItems)}${numberDetail('paper pages', telemetry.nativeSoak.paperPages)}${numberDetail('windows', telemetry.nativeSoak.workspaceWindows)}${numberDetail('cycles', telemetry.nativeSoak.cycles)}`
      : 'Native soak: no report found',
    telemetry.paperPdfParity.available
      ? `Paper PDF parity: ${statusWord(telemetry.paperPdfParity.ok)} ${telemetry.paperPdfParity.path}${arrayDetail('pages', telemetry.paperPdfParity.requestedPages)}${numberDetail('comparisons', telemetry.paperPdfParity.comparisonCount)}${numberDetail('PDF bytes', telemetry.paperPdfParity.pdfBytes)}`
      : 'Paper PDF parity: no report found',
    telemetry.androidImageSmoke.available
      ? `Android Image smoke: ${statusWord(telemetry.androidImageSmoke.ok)} ${telemetry.androidImageSmoke.path}${stringDetail('device', telemetry.androidImageSmoke.device)}${stringDetail('Android', telemetry.androidImageSmoke.androidRelease)}${numberDetail('API', telemetry.androidImageSmoke.apiLevel)}${stringDetail('package', telemetry.androidImageSmoke.packageId)}${booleanDetail('installed', telemetry.androidImageSmoke.installed)}${booleanDetail('visible', telemetry.androidImageSmoke.visible)}${stringDetail('readiness', telemetry.androidImageSmoke.readinessMovement)}`
      : 'Android Image smoke: no report found',
    telemetry.androidDex4kDisplay.available
      ? `Android Dex 4K display: ${statusWord(telemetry.androidDex4kDisplay.ok)} ${telemetry.androidDex4kDisplay.path}${stringDetail('device', telemetry.androidDex4kDisplay.device)}${displayDetail(telemetry.androidDex4kDisplay)}${numberDetail('density dpi', telemetry.androidDex4kDisplay.densityDpi)}${stringDetail('readiness', telemetry.androidDex4kDisplay.readinessMovement)}`
      : 'Android Dex 4K display: no report found',
    telemetry.androidDexImageWorkspace.available
      ? `Android Dex Image workspace: ${statusWord(telemetry.androidDexImageWorkspace.ok)} ${telemetry.androidDexImageWorkspace.path}${numberDetail('display', telemetry.androidDexImageWorkspace.display?.id)}${workspaceDetail(telemetry.androidDexImageWorkspace.workspace)}${screenshotDetail(telemetry.androidDexImageWorkspace.screenshot)}${dexReadinessDetail(telemetry.androidDexImageWorkspace.readiness)}`
      : 'Android Dex Image workspace: no report found',
    telemetry.androidDex1080pRestart.available
      ? `Android Dex 1080p restart: ${statusWord(telemetry.androidDex1080pRestart.ok)} ${telemetry.androidDex1080pRestart.path}${displaySizeDetail(telemetry.androidDex1080pRestart.display)}${workspaceDetail(telemetry.androidDex1080pRestart.workspace)}${documentDetail(telemetry.androidDex1080pRestart.workspace)}${screenshotDetail(telemetry.androidDex1080pRestart.screenshot)}${booleanDetail('direct display launch denied', telemetry.androidDex1080pRestart.restart?.directLaunchDisplayDenied)}`
      : 'Android Dex 1080p restart: no report found',
    telemetry.androidDex1080pOpenDocument.available
      ? `Android Dex 1080p open document: ${statusWord(telemetry.androidDex1080pOpenDocument.ok)} ${telemetry.androidDex1080pOpenDocument.path}${displaySizeDetail(telemetry.androidDex1080pOpenDocument.display)}${workspaceDetail(telemetry.androidDex1080pOpenDocument.workspace)}${documentDetail(telemetry.androidDex1080pOpenDocument.workspace)}${stringDetail('title', telemetry.androidDex1080pOpenDocument.workspace?.documentTitle)}${screenshotDetail(telemetry.androidDex1080pOpenDocument.screenshot)}${numberDetail('caveats', telemetry.androidDex1080pOpenDocument.caveatCount)}`
      : 'Android Dex 1080p open document: no report found',
    telemetry.androidDex1080pOpenDocumentEdit.available
      ? `Android Dex 1080p opened-document edit: ${statusWord(telemetry.androidDex1080pOpenDocumentEdit.ok)} ${telemetry.androidDex1080pOpenDocumentEdit.path}${displaySizeDetail(telemetry.androidDex1080pOpenDocumentEdit.display)}${workspaceDetail(telemetry.androidDex1080pOpenDocumentEdit.workspace)}${documentDetail(telemetry.androidDex1080pOpenDocumentEdit.workspace)}${stringDetail('title', telemetry.androidDex1080pOpenDocumentEdit.workspace?.documentTitle)}${openedDocumentEditDetail(telemetry.androidDex1080pOpenDocumentEdit.editEvidence)}${screenshotDetail(telemetry.androidDex1080pOpenDocumentEdit.screenshot)}`
      : 'Android Dex 1080p opened-document edit: no report found',
    telemetry.dockableTabUi.available
      ? `Dockable tab UI: ${statusWord(telemetry.dockableTabUi.ok)} ${telemetry.dockableTabUi.path}${numberDetail('viewports', telemetry.dockableTabUi.viewportCount)}${numberDetail('screenshots', telemetry.dockableTabUi.screenshotCount)}${numberDetail('max width delta', telemetry.dockableTabUi.maxWidthDelta)}${numberDetail('max height delta', telemetry.dockableTabUi.maxHeightDelta)}${booleanDetail('no Dock button', telemetry.dockableTabUi.fixedToolPalettesHaveNoDockButton)}${booleanDetail('stable tab groups', telemetry.dockableTabUi.tabGroupsPreserveStableDimensions)}`
      : 'Dockable tab UI: no report found',
    telemetry.imageParityWorkers.available
      ? `Image parity workers: ${statusWord(telemetry.imageParityWorkers.ok)} ${telemetry.imageParityWorkers.path}${numberDetail('active workers', telemetry.imageParityWorkers.activeCount)}`
      : 'Image parity workers: no active worker artifact found',
  ];

  return `
    <ul>
      ${rows.map((row) => `<li>${escapeHtml(row)}</li>`).join('')}
    </ul>
  `;
}

function imageCapabilityRowsHtml(rows) {
  if (!rows.length) return '<p class="subtle">No incomplete Image capability rows found.</p>';
  return `
    <h3 class="subtle">Top Incomplete Capabilities</h3>
    <ol>
      ${rows.map((row) => `
        <li>
          <b>${escapeHtml(row.area)}</b>
          <span class="${escapeHtml(row.status === 'remaining' ? 'red' : 'amber')}">${escapeHtml(row.status)}</span>
          <span class="subtle">${escapeHtml(row.priority)} priority, checklist ${escapeHtml(String(row.checklist.completed))}/${escapeHtml(String(row.checklist.total))}</span>
          <br />
          <span class="subtle">${escapeHtml(row.signalLoom)}</span>
        </li>
      `).join('')}
    </ol>
  `;
}

function imageParityRunTableHtml(features) {
  if (!features.length) return '<p class="subtle">No Image parity-run features found.</p>';
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Feature</th>
            <th scope="col">Objective</th>
            <th scope="col">Status</th>
            <th scope="col">Priority</th>
            <th scope="col">Progress</th>
            <th scope="col">Checklist</th>
            <th scope="col">Current State</th>
          </tr>
        </thead>
        <tbody>
          ${features.map((feature) => {
            const workerSummary = featureWorkerSummary(feature);
            const displayStatus = featureDisplayStatus(feature);
            const displayProgress = featureDisplayProgress(feature);
            return `
            <tr class="parity-row${workerSummary.className}" data-feature-id="${escapeHtml(feature.id)}" data-feature-status="${escapeHtml(displayStatus)}" data-worker-active="${escapeHtml(String(workerSummary.active))}" data-worker-mapped="${escapeHtml(String(workerSummary.hasWorkers))}" data-worker-count="${escapeHtml(String(workerSummary.count))}" data-worker-statuses="${escapeHtml(workerSummary.statuses.join(','))}" data-progress-method="checklist-atoms" ${featureWorkerStyle(feature)}>
              <td class="feature-cell">
                <b>${escapeHtml(feature.feature)}</b>
                <span>${escapeHtml(feature.id)}</span>
                ${workerChipsHtml(feature.workers)}
              </td>
              <td>${escapeHtml(feature.objective)}</td>
              <td class="${escapeHtml(displayStatus === 'done' ? 'green' : displayStatus === 'remaining' ? 'red' : 'amber')}">${escapeHtml(displayStatus)}</td>
              <td>${escapeHtml(feature.priority)}</td>
              <td class="progress-cell">${miniProgressHtml(displayProgress)}</td>
              <td class="checklist-cell">${featureChecklistHtml(feature.checklist)}</td>
              <td>${escapeHtml(feature.currentState)}</td>
            </tr>
          `;}).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function featureDisplayStatus(feature) {
  const checklist = feature?.checklist;
  if (checklist?.total > 0 && checklist.completed === checklist.total) return 'done';
  if (checklist?.total > 0 && checklist.remaining === 0) return 'done';
  if (feature?.status === 'remaining') return 'remaining';
  if (feature?.status === 'done') return 'done';
  return 'partial';
}

function featureDisplayProgress(feature) {
  const checklist = feature?.checklist;
  if (checklist?.total > 0 && Number.isFinite(checklist.completed)) {
    return roundPercent((checklist.completed / checklist.total) * 100);
  }
  return feature?.progressPercent;
}

function featureWorkerSummary(feature) {
  const workers = Array.isArray(feature.workers) ? feature.workers : [];
  const statuses = workers.map((worker) => worker.status);
  const activeCount = workers.filter((worker) => worker.status === 'active').length;
  return {
    workers,
    count: workers.length,
    statuses,
    active: activeCount > 0,
    hasWorkers: workers.length > 0,
    className: `${workers.length ? ' parity-row-worker-mapped' : ''}${activeCount ? ' parity-row-worker-active' : ''}`,
  };
}

function featureWorkerStyle(feature) {
  const activeWorker = Array.isArray(feature.workers)
    ? feature.workers.find((worker) => worker.status === 'active')
    : null;
  return activeWorker ? ` style="--worker-color: ${escapeHtml(sanitizeWorkerColor(activeWorker.color))}"` : '';
}

function workerChipsHtml(workers) {
  if (!Array.isArray(workers) || workers.length === 0) return '';
  return `
    <div class="worker-chips" aria-label="Active worker lanes">
      ${workers.map((worker) => `
        <span class="worker-chip" style="--worker-color: ${escapeHtml(sanitizeWorkerColor(worker.color))}" title="${escapeHtml(workerChipTitle(worker))}">
          ${escapeHtml(worker.name)}
        </span>
      `).join('')}
    </div>
  `;
}

function workerChipTitle(worker) {
  const labelParts = [worker.lane, worker.agent]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
  const lead = labelParts.length > 0 ? labelParts.join(' - ') : worker.name;
  const detail = String(worker.task || worker.status || '').trim();
  return detail ? `${lead}: ${detail}` : lead;
}

function featureChecklistHtml(checklist) {
  if (!checklist || !Array.isArray(checklist.items) || checklist.items.length === 0) {
    return '<p class="subtle">No checklist atoms available.</p>';
  }
  return `
    <section class="feature-checklist" aria-label="Static checklist atoms" data-static-checklist="true" data-checklist-expanded="true" data-checklist-completed="${escapeHtml(String(checklist.completed))}" data-checklist-total="${escapeHtml(String(checklist.total))}">
      <p class="feature-checklist-title">Checklist ${escapeHtml(String(checklist.completed))}/${escapeHtml(String(checklist.total))}</p>
      <p class="subtle checklist-method">${escapeHtml(checklist.method)}</p>
      <ul class="checklist-items">
        ${checklist.items.map((item) => `
          <li>
            <span class="check ${item.complete ? 'yes' : 'no'}" aria-label="${item.complete ? 'complete' : 'not complete'}">${item.complete ? '&#10003;' : '&#10005;'}</span>
            <span>${escapeHtml(item.label)}</span>
          </li>
        `).join('')}
      </ul>
    </section>
  `;
}

function miniProgressHtml(percent) {
  const clampedPercent = Math.max(0, Math.min(100, Number(percent) || 0));
  return `
    <div class="progress">
      <div class="progress-top">
        <span class="progress-value">${escapeHtml(String(clampedPercent))}%</span>
      </div>
      <div class="progress-track" aria-label="Feature progress">
        <div class="progress-fill" style="width: ${escapeHtml(String(clampedPercent))}%"></div>
      </div>
    </div>
  `;
}

function artifactTelemetryRow(label, artifact) {
  if (!artifact.available) return `${label}: missing ${artifact.path}`;
  return `${label}: ${artifact.path}${numberDetail('bytes', artifact.bytes)}`;
}

function statusWord(ok) {
  return ok ? 'PASS' : 'FAIL';
}

function numberDetail(label, value) {
  return typeof value === 'number' ? `, ${label}: ${value}` : '';
}

function arrayDetail(label, value) {
  return Array.isArray(value) && value.length > 0 ? `, ${label}: ${value.join(', ')}` : '';
}

function stringDetail(label, value) {
  return typeof value === 'string' && value.length > 0 ? `, ${label}: ${value}` : '';
}

function booleanDetail(label, value) {
  return typeof value === 'boolean' ? `, ${label}: ${value}` : '';
}

function workspaceDetail(workspace) {
  return typeof workspace?.imageWorkspaceEvidence === 'boolean'
    ? `, workspace: ${workspace.imageWorkspaceEvidence ? 'present' : 'missing'}`
    : '';
}

function documentDetail(workspace) {
  return stringDetail('document', workspace?.documentState);
}

function screenshotDetail(screenshot) {
  if (typeof screenshot?.resolution === 'string' && screenshot.resolution.length > 0) {
    return `, screenshot: ${screenshot.resolution}`;
  }
  return typeof screenshot?.captured === 'boolean' ? `, screenshot: ${screenshot.captured}` : '';
}

function openedDocumentEditDetail(editEvidence) {
  if (!editEvidence || typeof editEvidence !== 'object') return '';
  const state = editEvidence.evidenceLevel === 'opened-document-edit'
    ? 'present'
    : editEvidence.openedDocument
      ? 'open-only'
      : 'missing';
  return `, edit: ${state}`;
}

function dexReadinessDetail(readiness) {
  return typeof readiness?.shouldMoveAndroidDexReadiness === 'boolean'
    ? `, readiness: ${readiness.shouldMoveAndroidDexReadiness ? 'move' : 'hold'}`
    : stringDetail('readiness', readiness?.assessment);
}

function displayDetail(artifact) {
  return typeof artifact.logicalWidth === 'number' && typeof artifact.logicalHeight === 'number'
    ? `, display: ${artifact.logicalWidth}x${artifact.logicalHeight}`
    : '';
}

function displaySizeDetail(display) {
  return typeof display?.width === 'number' && typeof display?.height === 'number'
    ? `, display: ${display.width}x${display.height}`
    : '';
}

function taskListHtml(label, tasks, className) {
  if (!tasks.length) return `<p class="subtle">${escapeHtml(label)}: none.</p>`;
  return `
    <h3 class="subtle">${escapeHtml(label)}</h3>
    <ol>
      ${tasks.map((task) => `<li class="${escapeHtml(className)}">${escapeHtml(task.text)}</li>`).join('')}
    </ol>
  `;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function dashboardStableSignature(status) {
  return JSON.stringify(status, (key, value) => {
    if (key === 'generatedAt') return undefined;
    return value;
  });
}

function escapeScriptString(value) {
  return String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'")
    .replaceAll('<', '\\x3c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
