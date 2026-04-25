import { describe, expect, it } from 'vitest';
import {
  FLOW_NODE_INTERACTIVE_CLASS_NAME,
  withFlowNodeInteractionClasses,
} from './flowNodeInteraction';

describe('flow node interaction classes', () => {
  it('includes the React Flow drag, pan, and wheel suppression classes', () => {
    expect(FLOW_NODE_INTERACTIVE_CLASS_NAME.split(/\s+/)).toEqual(['nodrag', 'nopan', 'nowheel']);
  });

  it('preserves caller classes and avoids duplicating suppression classes', () => {
    expect(withFlowNodeInteractionClasses('rounded nodrag text-xs')).toBe('nodrag nopan nowheel rounded text-xs');
  });
});
