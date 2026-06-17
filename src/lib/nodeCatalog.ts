import type { FlowNodeType, NodeData } from '../types/flow';

export type FlowNodeCatalogCategoryId =
  | 'generate'
  | 'inputs-data'
  | 'lists-envelopes'
  | 'flow-control'
  | 'logic-math'
  | 'text-tools'
  | 'story-tools'
  | 'reuse-layout'
  | 'monitor-debug'
  | 'settings';

export interface FlowNodeCatalogCategory {
  id: FlowNodeCatalogCategoryId;
  label: string;
  description: string;
}

export interface FlowNodeCatalogEntry {
  type: FlowNodeType;
  label: string;
  description: string;
  categoryId: FlowNodeCatalogCategoryId;
  tags: string[];
  initialData?: Partial<NodeData>;
}

export const FLOW_NODE_CATALOG_CATEGORIES: FlowNodeCatalogCategory[] = [
  { id: 'generate', label: 'Generate', description: 'AI media generators and final outputs.' },
  { id: 'inputs-data', label: 'Inputs & Data', description: 'Prompts, primitive values, source-bin assets, and packages.' },
  { id: 'lists-envelopes', label: 'Lists & Envelopes', description: 'Batch inputs, typed lists, envelopes, and item expansion.' },
  { id: 'flow-control', label: 'Flow Control', description: 'Run triggers, loops, gates, and explicit loop stopping.' },
  { id: 'logic-math', label: 'Logic & Math', description: 'Boolean logic, comparisons, math, and routing.' },
  { id: 'text-tools', label: 'Text Tools', description: 'Templates, prompt joining, replacements, and prompt utilities.' },
  { id: 'story-tools', label: 'Story Tools', description: 'Sequential-art helpers for scenes, dialogue, state, and analysis.' },
  { id: 'reuse-layout', label: 'Reuse & Layout', description: 'Functions, groups, portals, aliases, and workspace organization.' },
  { id: 'monitor-debug', label: 'Monitor & Debug', description: 'Inspect values and verify connected media.' },
  { id: 'settings', label: 'Settings', description: 'Provider and execution configuration.' },
];

export const FLOW_NODE_CATALOG_ENTRIES: FlowNodeCatalogEntry[] = [
  entry('imageGen', 'Image', 'Generate or edit images with the selected image provider.', 'generate', ['image', 'ai', 'media']),
  entry('videoGen', 'Video', 'Generate video from prompts, frames, references, or source clips.', 'generate', ['video', 'ai', 'media']),
  entry('audioGen', 'Audio', 'Generate speech, sound effects, or voice-changed audio.', 'generate', ['audio', 'speech', 'ai']),
  entry('composition', 'Composition', 'Combine video, audio, and timeline assets into a rendered sequence.', 'generate', ['video', 'timeline', 'output']),

  entry('textNode', 'Text Prompt', 'Write a prompt or generate text for downstream nodes.', 'inputs-data', ['text', 'prompt', 'primitive']),
  entry('valueNode', 'Value', 'Create a typed primitive value: text, number, boolean, or JSON.', 'inputs-data', ['primitive', 'boolean', 'json', 'number']),
  entry('colorSwatchNode', 'Color Swatch', 'Build a reusable palette that guides image and video color consistency.', 'inputs-data', ['color', 'palette', 'swatch', 'theme', 'consistency']),
  entry('doodleNode', 'Doodle', 'Sketch a blue-pencil reference image plus a description, packaged for an Image node.', 'inputs-data', ['sketch', 'doodle', 'draw', 'reference', 'blue pencil'], { aspectRatio: '1:1', doodleDescription: '' }),
  entry('cropImageNode', 'Crop Image', 'Crop one connected image locally and output the cropped image downstream.', 'inputs-data', ['crop', 'image', 'asset', 'reference', 'storyboard']),
  entry('numberNode', 'Number', 'Legacy numeric value node for math and list workflows.', 'inputs-data', ['number', 'primitive']),
  entry('sourceBin', 'Source Bin', 'Expose project source-bin assets to the Flow canvas.', 'inputs-data', ['asset', 'source']),
  entry('packageNode', 'Asset Package', 'Bundle an image/media asset with descriptive text.', 'inputs-data', ['package', 'asset']),

  entry('list', 'Typed List', 'Collect connected items into a typed batch list.', 'lists-envelopes', ['list', 'batch']),
  entry('envelope', 'Envelope', 'Build or collect a typed list of output items.', 'lists-envelopes', ['envelope', 'typed list', 'batch']),
  entry('expander', 'Expander', 'Select one item from a list or envelope for downstream use.', 'lists-envelopes', ['list', 'select']),
  entry('arrayFlatNode', 'List Flattener', 'Flatten nested lists into one list.', 'lists-envelopes', ['list', 'nested']),
  entry('listLengthNode', 'List Length', 'Count items in a list or envelope.', 'lists-envelopes', ['list', 'count']),

  entry('runMeNode', 'RUN ME', 'Add an explicit run trigger waypoint.', 'flow-control', ['run', 'trigger']),
  entry('loopNode', 'Simple Loop', 'Repeat a connected item a fixed number of times.', 'flow-control', ['loop', 'batch']),
  entry('loopGateNode', 'While Gate', 'Gate or repeat while a condition remains true.', 'flow-control', ['loop', 'condition']),
  entry('loopBreakNode', 'Stop When', 'Stop a batch/list/envelope loop when a connected condition becomes true.', 'flow-control', ['break', 'stop', 'loop', 'condition']),
  entry('switchNode', 'On/Off Switch', 'Pass or block a connected signal.', 'flow-control', ['switch', 'gate']),
  entry('forkSwitchNode', 'Fork Switch', 'Choose one of two branch outputs.', 'flow-control', ['switch', 'branch']),

  entry('logicNode', 'Boolean Logic', 'Combine boolean-like values with AND, OR, XOR, or NOT.', 'logic-math', ['boolean', 'logic']),
  entry('conditionalNode', 'If / Else', 'Choose between two values from a boolean-like condition.', 'logic-math', ['if', 'conditional']),
  entry('comparisonNode', 'Compare', 'Compare text or numbers and output a boolean.', 'logic-math', ['compare', 'boolean']),
  entry('switchCaseNode', 'Switch Case', 'Route values by matching a case.', 'logic-math', ['case', 'route']),
  entry('mathNode', 'Math', 'Perform arithmetic on numeric values.', 'logic-math', ['math', 'number']),
  entry('fallbackSelectorNode', 'Fallback Selector', 'Select the first usable value from candidates.', 'logic-math', ['fallback', 'route']),
  entry('javascriptNode', 'JavaScript Script', 'Execute custom JavaScript code with inputs A, B, and C.', 'logic-math', ['javascript', 'js', 'script', 'code', 'function', 'custom']),
  entry('jsonQueryNode', 'JSON Query', 'Extract data from a JSON object using JavaScript expression paths.', 'logic-math', ['json', 'query', 'path', 'extract', 'object', 'jsonata']),
  entry('regexParseNode', 'Regex Parse', 'Parse text and extract match groups using a regular expression pattern.', 'logic-math', ['regex', 'parse', 'match', 'pattern', 'extract', 'groups']),
  entry('pythonNode', 'Python Script', 'Execute Python-like script/expression logic with inputs A, B, and C.', 'logic-math', ['python', 'py', 'script', 'code', 'function', 'custom']),
  entry('jsonBuilderNode', 'JSON Builder', 'Construct a JSON object dynamically from inputs A, B, C, D, and E.', 'logic-math', ['json', 'build', 'create', 'object', 'template']),
  entry('htmlSandboxNode', 'HTML Sandbox', 'Render dynamic HTML, CSS, and JS inside an interactive sandbox iframe.', 'logic-math', ['html', 'css', 'js', 'sandbox', 'preview', 'iframe', 'visual']),
  entry('apiFetchNode', 'API Requester', 'Perform a GET or POST web request to any URL with custom headers and body.', 'logic-math', ['fetch', 'api', 'request', 'http', 'get', 'post', 'url', 'web']),
  entry('sqlQueryNode', 'SQL Query', 'Execute SELECT queries and JOIN operations on arrays A and B.', 'logic-math', ['sql', 'query', 'join', 'select', 'where', 'list', 'filter']),
  entry('csvParserNode', 'CSV Interop', 'Parse CSV to JSON lists or format JSON lists into CSV files.', 'logic-math', ['csv', 'parse', 'format', 'interop', 'list', 'excel']),
  entry('mathExpressionNode', 'Math Expression', 'Evaluate multi-variable algebraic formulas and math functions.', 'logic-math', ['math', 'expression', 'formula', 'algebra', 'equation']),
  entry('xmlYamlNode', 'XML/YAML Interop', 'Convert data seamlessly between JSON, XML, and YAML structures.', 'logic-math', ['xml', 'yaml', 'json', 'interop', 'parse', 'convert']),

  entry('stringTemplateNode', 'String Template', 'Render text from placeholders like {A}, {B}, and {C}.', 'text-tools', ['template', 'prompt']),
  entry('regexReplaceNode', 'Regex Replace', 'Replace text using a regular expression.', 'text-tools', ['regex', 'text']),
  entry('promptsJoinerNode', 'Prompt Joiner', 'Join prompt fragments with a delimiter.', 'text-tools', ['join', 'prompt']),
  entry('negativePromptNode', 'Negative Prompt', 'Combine exclusions and negative prompt fragments.', 'text-tools', ['negative', 'prompt']),
  entry('promptMixerNode', 'Prompt Mixer', 'Mix prompt variations for story and art generation.', 'text-tools', ['prompt', 'variation']),

  entry('storyStateNode', 'Story State', 'Store or reuse a named story variable.', 'story-tools', ['story', 'state']),
  entry('seedSequencerNode', 'Seed Sequencer', 'Generate repeatable seed sequences.', 'story-tools', ['seed', 'sequence']),
  entry('textSentimentAnalysisNode', 'Sentiment Analyzer', 'Analyze text sentiment for routing or scene logic.', 'story-tools', ['text', 'analysis']),
  entry('imageFeatureExtractorNode', 'Image Feature Extractor', 'Extract image features for consistency checks.', 'story-tools', ['image', 'analysis']),
  entry('dialogueScriptSplitterNode', 'Dialogue Splitter', 'Split dialogue/script text into usable story chunks.', 'story-tools', ['dialogue', 'script']),

  entry('functionNode', 'Function', 'Use or configure a reusable collapsed graph function.', 'reuse-layout', ['function', 'reuse']),
  entry('groupNode', 'Group', 'Group related nodes visually on the canvas.', 'reuse-layout', ['group', 'layout']),
  entry('functionInputNode', 'Function Input Marker', 'Define a custom function entry point / input handle.', 'reuse-layout', ['function', 'input', 'marker', 'handle', 'entry']),
  entry('functionOutputNode', 'Function Output Marker', 'Define a custom function exit point / output handle.', 'reuse-layout', ['function', 'output', 'marker', 'handle', 'exit']),
  entry('virtual', 'Virtual Alias', 'Reuse an upstream output elsewhere without moving the original node.', 'reuse-layout', ['alias', 'reuse']),
  entry('portal', 'Portal Pair', 'Create paired waypoints for long-distance wiring.', 'reuse-layout', ['portal', 'layout']),
  entry('advancedImageEditor', 'Image Editor', 'Open an image-editing workspace node.', 'reuse-layout', ['image', 'editor']),

  entry('valueMonitorNode', 'Value Monitor', 'Inspect a connected signal, list, envelope, or media value.', 'monitor-debug', ['monitor', 'debug']),
  entry('visionVerifyNode', 'Vision Verify', 'Ask a vision model to verify an image against a prompt.', 'monitor-debug', ['vision', 'verify']),

  entry('settings', 'Config', 'Configure execution defaults for connected nodes.', 'settings', ['settings', 'config']),
];

export function getNodeCatalogEntry(type: FlowNodeType): FlowNodeCatalogEntry | undefined {
  return FLOW_NODE_CATALOG_ENTRIES.find((entry) => entry.type === type);
}

export function getNodeCatalogEntriesForCategory(categoryId: FlowNodeCatalogCategoryId): FlowNodeCatalogEntry[] {
  return FLOW_NODE_CATALOG_ENTRIES.filter((entry) => entry.categoryId === categoryId);
}

export function findNodeCatalogEntries(query: string): FlowNodeCatalogEntry[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return FLOW_NODE_CATALOG_ENTRIES;
  }

  return FLOW_NODE_CATALOG_ENTRIES.filter((entry) => [
    entry.label,
    entry.description,
    entry.categoryId,
    ...entry.tags,
  ].some((value) => value.toLowerCase().includes(normalized)));
}

function entry(
  type: FlowNodeType,
  label: string,
  description: string,
  categoryId: FlowNodeCatalogCategoryId,
  tags: string[],
  initialData?: Partial<NodeData>,
): FlowNodeCatalogEntry {
  return { type, label, description, categoryId, tags, initialData };
}
