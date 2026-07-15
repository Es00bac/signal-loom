# Flow Contracts and Typed Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan.

**Goal:** Make all 62 Flow node types contract-driven, reject incompatible new connections, preserve and diagnose invalid legacy edges, color and direct wires by payload type, and fix Image reference handles without changing the approved Sloom node design.

**Architecture:** Add an exhaustive node/port contract registry and a graph resolver that derives dynamic ports from node data and graph state. React Flow, the store, diagnostics, execution preflight, handle rendering, help, and tests all consume the same resolver. Persisted nodes and edges remain schema-compatible; presentation metadata is derived at runtime.

**Tech Stack:** React 19, TypeScript, Zustand, `@xyflow/react`, Vitest, Testing Library, Tailwind.

## Global Constraints

- Preserve the current Flow canvas and node chrome shown in the approved July 2026 screenshots.
- Do not edit Paper or Image workspace implementation files.
- Do not silently delete, retarget, or coerce existing edges.
- Exact compatibility is the default; `unknown` is not `any`.
- Keep contract logic pure and covered before wiring UI behavior.
- Commit only files owned by this plan; preserve concurrent worktree changes.

---

### Task 1: Define the runtime Flow type and port vocabulary

**Files:**
- Create: `src/lib/flowPortTypes.ts`
- Test: `src/lib/flowPortTypes.test.ts`
- Modify: `src/types/flow.ts`

**Step 1: Write failing tests for type identity and compatibility**

Cover scalar/media/control/unknown types, `list<T>`, `envelope<T>`, `package`, unions, display labels, colors, patterns, and converter suggestions. Prove `number -> text`, `text -> json`, `image -> video`, and `unknown -> text` are rejected while exact and explicitly accepted union matches pass.

Run: `npm test -- --run src/lib/flowPortTypes.test.ts`
Expected: FAIL because the module does not exist.

**Step 2: Add strict runtime types**

Implement:

```ts
export type FlowDataType =
  | { kind: 'text' | 'number' | 'boolean' | 'json' | 'image' | 'video' | 'audio' | 'package' | 'control' | 'unknown' }
  | { kind: 'list' | 'envelope'; item: FlowDataType | { kind: 'mixed' } };

export interface FlowTypeCompatibility {
  compatible: boolean;
  source: FlowDataType;
  accepted: readonly FlowDataType[];
  reason?: string;
  converterNodeTypes?: readonly FlowNodeType[];
}
```

Export pure helpers `flowDataTypeEquals`, `isFlowTypeAccepted`, `describeFlowDataType`, `flowDataTypeColor`, and `flowTypeLineStyle`. Keep `ResultType` as the persisted compatibility vocabulary and add conversion helpers between persisted and runtime representations.

**Step 3: Run focused tests and typecheck**

Run: `npm test -- --run src/lib/flowPortTypes.test.ts && npx tsc -b --pretty false`
Expected: PASS.

**Step 4: Commit**

```bash
git add src/lib/flowPortTypes.ts src/lib/flowPortTypes.test.ts src/types/flow.ts
git commit -m "feat(flow): add strict runtime value types"
```

### Task 2: Create the exhaustive node contract registry

**Files:**
- Create: `src/lib/flowNodeContracts.ts`
- Test: `src/lib/flowNodeContracts.test.ts`
- Modify: `src/lib/nodeCatalog.ts`
- Modify: `src/lib/nodeCatalog.test.ts`

**Step 1: Write completeness and quality tests**

Assert the registry is `satisfies Record<FlowNodeType, FlowNodeContract>`, contains exactly the 62 `FLOW_NODE_TYPES`, has unique stable handle IDs per direction, non-empty purpose/help/example/failure text, an intentional execution role, and no orphan catalog entries. Assert structural `groupNode` is explicitly UI-only with no invented data output.

**Step 2: Define contracts and resolver context**

Implement:

```ts
export interface FlowPortContract {
  id: string;
  direction: 'input' | 'output';
  label: string;
  help: string;
  types: readonly FlowDataType[];
  required: boolean;
  minConnections: number;
  maxConnections: number | null;
  ordered: boolean;
  side?: 'left' | 'right' | 'top' | 'bottom';
  disabledReason?: string;
}

export interface FlowNodeContract {
  type: FlowNodeType;
  role: 'source' | 'transform' | 'control' | 'sink' | 'container' | 'boundary' | 'ui-only';
  purpose: string;
  help: string;
  failureModes: readonly string[];
  examples: readonly { title: string; upstream: readonly FlowNodeType[]; downstream: readonly FlowNodeType[]; description: string }[];
  resolvePorts(context: FlowNodeContractContext): readonly FlowPortContract[];
  implementation: { status: 'implemented' | 'structural'; path: string; apiCapability?: 'text' | 'image' | 'video' | 'audio' };
}
```

Use existing constants from image/video/list/composition/function helpers rather than duplicating special handle IDs. Build shared templates only where semantics truly match.

**Step 3: Encode all 62 contracts**

Cover these groups explicitly:

- Generators/sinks: `textNode`, `imageGen`, `cropImageNode`, `videoGen`, `audioGen`, `composition`, `visionVerifyNode`.
- Primitive/asset sources: `sourceBin`, `valueNode`, `numberNode`, `colorSwatchNode`, `colorSwatchListNode`, `loraSpecNode`, `doodleNode`, `slimgNode`, `packageNode`, `settings`.
- Containers: `list`, `envelope`, `expander`, `arrayFlatNode`, `listLengthNode`.
- Control/routing: `switchNode`, `forkSwitchNode`, `runMeNode`, `loopNode`, `loopGateNode`, `loopBreakNode`, `conditionalNode`, `switchCaseNode`, `fallbackSelectorNode`.
- Logic/math: `logicNode`, `comparisonNode`, `mathNode`, `mathExpressionNode`, `seedSequencerNode`.
- Text/story transforms: `stringTemplateNode`, `regexReplaceNode`, `regexParseNode`, `promptsJoinerNode`, `negativePromptNode`, `promptMixerNode`, `storyStateNode`, `textSentimentAnalysisNode`, `dialogueScriptSplitterNode`, `imageFeatureExtractorNode`.
- Flexible/data interop: `javascriptNode`, `pythonNode`, `jsonQueryNode`, `jsonBuilderNode`, `htmlSandboxNode`, `apiFetchNode`, `sqlQueryNode`, `csvParserNode`, `xmlYamlNode`.
- Boundaries/layout: `functionNode`, `functionInputNode`, `functionOutputNode`, `virtual`, `portal`, `groupNode`, `advancedImageEditor`, `valueMonitorNode`.

Dynamic rules must include selected text output format; image/video/audio model capabilities; list/envelope element inference; function bindings; portal transported type; conditional/switch branch unification; and declared outputs for flexible nodes. Flexible nodes default to `unknown` until the user selects a result type.

**Step 4: Make catalog text contract-backed**

Retain localized labels/tags in `nodeCatalog.ts`, but source English purpose/description and example help from the contract registry. Add a development/test assertion if localized/categorized entries drift from the exhaustive registry.

**Step 5: Run tests**

Run: `npm test -- --run src/lib/flowNodeContracts.test.ts src/lib/nodeCatalog.test.ts`
Expected: PASS with all 62 contracts represented.

**Step 6: Commit**

```bash
git add src/lib/flowNodeContracts.ts src/lib/flowNodeContracts.test.ts src/lib/nodeCatalog.ts src/lib/nodeCatalog.test.ts
git commit -m "feat(flow): define contracts for every node type"
```

### Task 3: Resolve ports and validate graph connections centrally

**Files:**
- Create: `src/lib/flowConnectionContracts.ts`
- Test: `src/lib/flowConnectionContracts.test.ts`
- Modify: `src/store/flowStore.ts`
- Modify: `src/store/flowStore.test.ts`

**Step 1: Write resolver and validation tests**

Test source/target lookup, missing handles, dynamic ports, connection limits, loops, list element typing, function ports, portals, and model-disabled inputs. Prove the public validator returns a deterministic result for both a React Flow `Connection` and a persisted `Edge`.

**Step 2: Implement pure graph services**

Add:

```ts
export interface FlowConnectionValidation {
  valid: boolean;
  sourcePort?: FlowPortContract;
  targetPort?: FlowPortContract;
  carriedType: FlowDataType;
  reason?: string;
  suggestedConverters?: readonly FlowNodeType[];
}

export function resolveNodePorts(node: AppNode, graph: FlowGraphContext): readonly FlowPortContract[];
export function validateFlowConnection(connection: Connection | Edge, graph: FlowGraphContext): FlowConnectionValidation;
export function annotateFlowEdge(edge: Edge, graph: FlowGraphContext): Edge;
```

The resolver must be side-effect free and must not require evaluating/billing API nodes.

**Step 3: Make the store authoritative**

In `flowStore.onConnect`, retain image/video/composition/list normalization, then call the universal validator before `addEdge`. On rejection, patch an actionable target error and leave graph state unchanged. On acceptance, attach derived non-secret presentation data. On node/config/load normalization, retain invalid existing edges and annotate them as invalid instead of pruning them.

**Step 4: Run store tests**

Run: `npm test -- --run src/lib/flowConnectionContracts.test.ts src/store/flowStore.test.ts`
Expected: PASS, including rejection of programmatic incompatible connections.

**Step 5: Commit**

```bash
git add src/lib/flowConnectionContracts.ts src/lib/flowConnectionContracts.test.ts src/store/flowStore.ts src/store/flowStore.test.ts
git commit -m "feat(flow): enforce typed graph connections"
```

### Task 4: Add typed edge rendering, direction, and drag feedback

**Files:**
- Create: `src/components/Flow/TypedFlowEdge.tsx`
- Create: `src/components/Flow/TypedConnectionLine.tsx`
- Create: `src/components/Flow/flowEdgePresentation.ts`
- Test: `src/components/Flow/TypedFlowEdge.test.tsx`
- Modify: `src/features/flow/workspace/FlowWorkspaceShell.tsx`
- Modify: `src/features/flow/workspace/FlowWorkspaceShell.test.tsx`
- Modify: `src/index.css`

**Step 1: Write UI tests**

Assert exact payload color, arrow marker, container dash/pattern, neutral control/unknown style, red dashed invalid legacy style, selected label, and invalid-drag reason. Test `ReactFlow` receives `isValidConnection`, `edgeTypes`, `connectionLineComponent`, and typed `defaultEdgeOptions`.

**Step 2: Implement edge presentation**

Use a custom Bezier edge with `BaseEdge`, an accessible `markerEnd`, and derived `data.flowContract`. Do not overwrite user edge labels. Use hue plus shape/pattern and `aria-label`; invalid edges remain selectable.

**Step 3: Wire drag validation**

In `FlowWorkspaceShell`, build the graph context from current nodes/edges. Pass `isValidConnection` for immediate feedback and re-use the same validator to render a compact connection-line error. Do not make the component authoritative; the store remains the second check.

**Step 4: Run UI tests**

Run: `npm test -- --run src/components/Flow/TypedFlowEdge.test.tsx src/features/flow/workspace/FlowWorkspaceShell.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/Flow/TypedFlowEdge.tsx src/components/Flow/TypedConnectionLine.tsx src/components/Flow/flowEdgePresentation.ts src/components/Flow/TypedFlowEdge.test.tsx src/features/flow/workspace/FlowWorkspaceShell.tsx src/features/flow/workspace/FlowWorkspaceShell.test.tsx src/index.css
git commit -m "feat(flow): render typed directional edges"
```

### Task 5: Make handles contract-aware and fix Image references

**Files:**
- Create: `src/components/Nodes/TypedHandle.tsx`
- Test: `src/components/Nodes/TypedHandle.test.tsx`
- Modify: `src/components/Nodes/CollapsedConnectionHandles.tsx`
- Modify: `src/components/Nodes/BaseNode.tsx`
- Modify: node components under `src/components/Nodes/` only where they render custom handles
- Modify: `src/components/Nodes/ImageNode.tsx`
- Modify: `src/components/Nodes/ImageNode.test.tsx`

**Step 1: Write failing handle tests**

Assert handles use contract colors and source/target shape cues, unsupported model ports are visible but disabled with a reason, collapsed stubs preserve color and ordering, and all Image reference handles are exterior.

For Image references assert:

- references 1, 3, 5, … use `Position.Left`;
- references 2, 4, 6, … use `Position.Right`;
- no reference target uses the interior seam;
- right-side reference targets have a reserved vertical region below the main image source handle;
- output and input handles have distinct accessible titles/shapes.

**Step 2: Implement `TypedHandle`**

Wrap React Flow `Handle`; accept a resolved `FlowPortContract`, apply type style and source/target cue, set `isConnectable={false}` for `disabledReason`, and show the reason through title/accessible description. Preserve `nodrag nopan` and existing sizes unless overlap requires a local adjustment.

**Step 3: Adopt typed handles incrementally but exhaustively**

Use contract resolution in `BaseNode` and custom-handle nodes. Do not rewrite node bodies. Update `CollapsedConnectionHandles` to resolve connected handle contracts and use deterministic left/right spacing.

**Step 4: Fix the reference grid**

Pass `side={index % 2 === 0 ? 'left' : 'right'}` to `ImageReferenceSlot`. Add right padding on right cards and a short association line. Position right-side targets on the node exterior via card-relative offset or an exterior overlay whose y-coordinate matches the card; ensure the main image result handle owns a separate output region.

**Step 5: Run node tests**

Run: `npm test -- --run src/components/Nodes/TypedHandle.test.tsx src/components/Nodes/ImageNode.test.tsx`
Expected: PASS.

**Step 6: Commit**

```bash
git add src/components/Nodes/TypedHandle.tsx src/components/Nodes/TypedHandle.test.tsx src/components/Nodes/CollapsedConnectionHandles.tsx src/components/Nodes/BaseNode.tsx src/components/Nodes src/components/Nodes/ImageNode.tsx src/components/Nodes/ImageNode.test.tsx
git commit -m "feat(flow): align typed handles and image references"
```

### Task 6: Diagnose invalid edges and preflight execution

**Files:**
- Modify: `src/lib/flowDiagnostics.ts`
- Modify: `src/lib/flowDiagnostics.test.ts`
- Modify: `src/lib/flowExecution.ts`
- Test: `src/lib/flowExecutionPreflight.test.ts`

**Step 1: Write failing diagnostics/preflight tests**

Cover invalid types, missing required inputs, disabled model ports, too many connections, legacy edges, and valid dynamic configurations. Assert all blocking issues are reported before the first provider fetch/native bridge call.

**Step 2: Add contract diagnostics**

Iterate every edge through `validateFlowConnection`; create blocking diagnostics with node/edge IDs, source/target types, and converter suggestion. Iterate required ports after resolving connection counts. Preserve existing function/signal diagnostics.

**Step 3: Add execution preflight**

Call blocking diagnostics at the public execution boundary. Abort before billable calls with one combined actionable error. Do not duplicate provider parameter validation planned in the catalog plan.

**Step 4: Run tests**

Run: `npm test -- --run src/lib/flowDiagnostics.test.ts src/lib/flowExecutionPreflight.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/flowDiagnostics.ts src/lib/flowDiagnostics.test.ts src/lib/flowExecution.ts src/lib/flowExecutionPreflight.test.ts
git commit -m "feat(flow): preflight node and edge contracts"
```

### Task 7: Add contract-aware help and declared outputs for flexible nodes

**Files:**
- Create: `src/components/Layout/NodeContractHelp.tsx`
- Test: `src/components/Layout/NodeContractHelp.test.tsx`
- Modify: `src/components/Layout/BottomToolbar.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Nodes/JavaScriptNode.tsx`
- Modify: `src/components/Nodes/PythonNode.tsx`
- Modify: `src/components/Nodes/ApiFetchNode.tsx`
- Modify: `src/components/Nodes/SqlQueryNode.tsx`
- Modify: `src/components/Nodes/JsonQueryNode.tsx`
- Modify: `src/components/Nodes/JsonBuilderNode.tsx`
- Modify: `src/components/Nodes/CsvParserNode.tsx`
- Modify: `src/components/Nodes/XmlYamlNode.tsx`
- Modify: `src/components/Nodes/HtmlSandboxNode.tsx`
- Modify: `src/types/flow.ts`
- Test: focused tests matching each modified flexible node

**Step 1: Add tests for help and output declarations**

The node picker/help must expose purpose, accepted inputs, output, failure modes, and an example. JavaScript, Python, API Fetch, SQL, JSON Query/Builder, CSV, XML/YAML, and HTML Sandbox must expose a result-type selector where output cannot be inferred. Default remains `unknown` and does not masquerade as text/JSON.

**Step 2: Implement minimal compact UI**

Reuse existing selects and details panels. Keep all nodes selectable. Unsupported or unresolved ports remain visible with warnings and blocked handles.

**Step 3: Run affected tests and all Flow tests**

Run: `npm test -- --run src/lib/flowPortTypes.test.ts src/lib/flowNodeContracts.test.ts src/lib/flowConnectionContracts.test.ts src/lib/flowDiagnostics.test.ts src/components/Nodes src/features/flow`
Expected: PASS.

**Step 4: Commit**

Stage only the actual help/flexible-node files and commit:

```bash
git commit -m "feat(flow): expose node contracts in the interface"
```

### Task 8: Plan verification gate

Run:

```bash
npm test -- --run src/lib/flowPortTypes.test.ts src/lib/flowNodeContracts.test.ts src/lib/flowConnectionContracts.test.ts src/lib/flowDiagnostics.test.ts src/store/flowStore.test.ts src/components/Nodes/ImageNode.test.tsx src/features/flow/workspace/FlowWorkspaceShell.test.tsx
npx tsc -b --pretty false
npm run lint
```

Expected: all pass. Record any unrelated pre-existing lint failures without modifying concurrent Paper/Image work.
