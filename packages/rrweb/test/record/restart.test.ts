/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it } from 'vitest';
import record from '../../src/record';
import { mutationBuffers } from '../../src/record/observer';

describe('record restart cleanup', () => {
  afterEach(() => {
    mutationBuffers.splice(0);
  });

  it('does not retain mutation buffers after repeated stop and restart', () => {
    for (let generation = 0; generation < 3; generation += 1) {
      const stop = record({ emit: () => undefined });

      expect(stop).toBeTypeOf('function');
      expect(mutationBuffers.length).toBeGreaterThan(0);
      stop?.();
      expect(mutationBuffers).toHaveLength(0);
    }
  });
});
