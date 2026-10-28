import { defineConfig } from 'vitest/config';

// All metric math lives in packages/core, so that is where most tests live.
// functions/ingest tests only the run's failure policy (fetch, fallback, finalize).
// apps/web tests only display formatting: it computes no metrics.
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'packages/*/src/**/*.test.ts',
      'functions/*/src/**/*.test.ts',
      'scripts/**/*.test.ts',
      'apps/*/src/**/*.test.ts',
    ],
    coverage: {
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts'],
    },
  },
});
