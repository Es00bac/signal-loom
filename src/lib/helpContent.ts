export type HelpSectionId =
  | 'project-documentation'
  | 'tutorial'
  | 'feature-help'
  | 'keyboard-shortcuts';

export interface HelpContentGroup {
  title: string;
  items: string[];
}

export interface HelpContentSection {
  id: HelpSectionId;
  title: string;
  summary: string;
  groups: HelpContentGroup[];
}

export const HELP_SECTIONS: HelpContentSection[] = [
  {
    id: 'project-documentation',
    title: 'Project Documentation',
    summary: 'Signal Loom is a node-based generative AI media studio with a timeline editor for assembling, animating, and rendering audio/video projects.',
    groups: [
      {
        title: 'Core Workspaces',
        items: [
          'Flow workspace: build generation graphs with text, image, video, audio, settings, source-bin, composition, and alias nodes.',
          'Editor workspace: assemble source-bin media and editor assets into a sequenced program timeline.',
          'Source bin: keep project-owned media, generated assets, text, shapes, and imported files available for reuse.',
        ],
      },
      {
        title: 'Project Storage',
        items: [
          'Use File > Save or Save As in Electron for native .sloom project files.',
          'Electron projects automatically use a sibling per-project scratch folder so source-bin media reopens with the project.',
          'Use File > Set Scratch Folder only when you need to redirect unsaved-project imports before the project has its own .sloom file.',
          'Browser mode keeps the integrated menu and downloads portable .sloom project files where native file access is not available.',
        ],
      },
      {
        title: 'Rendering',
        items: [
          'The program monitor and final render use shared transform, crop, filter, opacity, and keyframe math.',
          'Native FFmpeg rendering can use the local render service when it is available; browser rendering remains the fallback.',
        ],
      },
    ],
  },
  {
    id: 'tutorial',
    title: 'Tutorial',
    summary: 'A quick path from imported media to a rendered edit.',
    groups: [
      {
        title: '1. Create or Open a Project',
        items: [
          'Start from File > New Project or File > Open.',
          'In Electron, save the project as a .sloom file before large imports so Signal Loom creates and uses that project’s scratch folder.',
          'Switch to the Editor workspace from the titlebar or View menu.',
        ],
      },
      {
        title: '2. Add Media',
        items: [
          'Import images, video, or audio into the source bin.',
          'Create text or shape editor assets from the editor asset tab.',
          'Drag source-bin items into visual or audio lanes.',
        ],
      },
      {
        title: '3. Edit the Timeline',
        items: [
          'Select a clip, move the red playhead, then press Cut or C to split the selected visual clip at the playhead.',
          'Drag clip edges to trim non-destructively; hidden source media remains recoverable by dragging the edge back out.',
          'Hold Shift while scrubbing, cutting, snapping, or trimming to use whole-second steps.',
        ],
      },
      {
        title: '4. Animate and Finish',
        items: [
          'Use K or Add Key to keyframe transform, opacity, or volume at the playhead.',
          'Use the inspector for crop, filters, blend modes, volume, and precise transform values.',
          'Render the composition once the program monitor matches the intended result.',
        ],
      },
    ],
  },
  {
    id: 'feature-help',
    title: 'Feature Help',
    summary: 'Reference for the major Signal Loom tools and editor features.',
    groups: [
      {
        title: 'Timeline Tools',
        items: [
          'Select moves clips and chooses the active clip for inspector edits.',
          'Cut splits the selected visual clip at the playhead; clicking a clip in cut mode also cuts at the playhead.',
          'Slip shifts source content inside a clip without moving the clip timing.',
          'Hand pans the timeline viewport when zoomed in.',
          'Snap adds custom snap points on the time ruler.',
        ],
      },
      {
        title: 'Text and Shapes',
        items: [
          'Text is a natural text-sized layer, not a visible rectangle; select it to show transform handles.',
          'Shape assets are separate timeline-backed rectangle layers.',
          'Right-click text assets or text clips to edit wording, font, color, size, and text effects.',
        ],
      },
      {
        title: 'Crop, Filters, and Transforms',
        items: [
          'Crop is non-destructive and changes how a source appears in the editor monitor and render.',
          'Pan and rotate the media inside the crop boundary without changing the original source asset.',
          'Image, video, and text clips can use filter stacks, opacity, blend modes, and keyframed transforms.',
        ],
      },
      {
        title: 'Audio',
        items: [
          'Audio lanes support clip volume, per-track volume, waveform previews, and volume keyframes.',
          'Video assets can also be placed on audio lanes when their audio is needed separately.',
        ],
      },
      {
        title: 'Gaps and Snapping',
        items: [
          'Cutting leaves timeline gaps in place.',
          'Select a gap and right-click it to fill that gap.',
          'Hold Shift during timeline operations to snap to whole seconds.',
        ],
      },
    ],
  },
  {
    id: 'keyboard-shortcuts',
    title: 'Keyboard Shortcuts',
    summary: 'Common editor shortcuts.',
    groups: [
      {
        title: 'Navigation',
        items: [
          'Left / Right: scrub the playhead by 0.1 seconds.',
          'Shift + Left / Right: scrub by whole seconds.',
          '[ / ]: jump to the previous or next keyframe on the selected clip.',
        ],
      },
      {
        title: 'Editing',
        items: [
          'C: cut the selected visual clip at the playhead when possible, otherwise enter cut mode.',
          'V: select tool.',
          'S: slip tool.',
          'H: hand tool.',
          'M: snap marker tool.',
          'K: add or update a keyframe at the playhead.',
          'Delete / Backspace: remove the selected clip or stage object.',
        ],
      },
      {
        title: 'App',
        items: [
          'Ctrl/Cmd + Z: undo editor changes.',
          'Ctrl/Cmd + Shift + Z or Ctrl + Y: redo editor changes.',
          'F1 or Shift + /: open help.',
          'Esc: close help and context menus.',
        ],
      },
    ],
  },
];

export function getHelpSection(sectionId: HelpSectionId): HelpContentSection {
  return HELP_SECTIONS.find((section) => section.id === sectionId) ?? HELP_SECTIONS[0];
}
