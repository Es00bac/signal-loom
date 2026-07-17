import { describe, expect, it } from 'vitest';
import { resetProjectLifecycleForTests, runProjectLifecycleTransition } from './projectLifecycle';

describe('project lifecycle sequence', () => {
  it('does not let a later transition complete before the accepted transition ahead of it', async () => {
    resetProjectLifecycleForTests();
    const events: string[] = [];
    let releaseProjectA = () => {};
    const projectAGate = new Promise<void>((resolve) => { releaseProjectA = resolve; });

    const projectA = runProjectLifecycleTransition(async () => {
      events.push('A:apply');
      await projectAGate;
      events.push('A:remember');
    });
    const projectB = runProjectLifecycleTransition(async () => {
      events.push('B:apply');
      events.push('B:remember');
    });

    await Promise.resolve();
    expect(events).toEqual(['A:apply']);
    releaseProjectA();
    await Promise.all([projectA, projectB]);
    expect(events).toEqual(['A:apply', 'A:remember', 'B:apply', 'B:remember']);
  });

  it('continues the sequence after a canceled or failed transition', async () => {
    resetProjectLifecycleForTests();
    const events: string[] = [];
    await expect(runProjectLifecycleTransition(async () => {
      events.push('cancel');
      throw new Error('canceled');
    })).rejects.toThrow('canceled');
    await runProjectLifecycleTransition(async () => { events.push('next'); });
    expect(events).toEqual(['cancel', 'next']);
  });
});
