/// <reference types="vitest" />
import { defineProject, mergeConfig } from 'vitest/config';
import configShared from '../../vitest.config';

export default mergeConfig(
  configShared,
  defineProject({
    test: {
      globals: true,
      testTimeout: 120_000,
      hookTimeout: 120_000,
      pool: 'forks',
      fileParallelism: false,
    },
  }),
);
