import { defineConfig } from 'vitest/config';
import path from 'path';

const FILE_ORDER = [
  'phase1.test.ts',
  'phase2.test.ts',
  'phase3-4.test.ts',
  'fixes.test.ts',
  'guards.test.ts',
];

function sortIndex(filePath: string): number {
  const base = path.basename(filePath);
  const i = FILE_ORDER.indexOf(base);
  return i === -1 ? FILE_ORDER.length : i;
}

export default defineConfig({
  test: {
    include: [
      'src/__tests__/phase1.test.ts',
      'src/__tests__/phase2.test.ts',
      'src/__tests__/phase3-4.test.ts',
      'src/__tests__/fixes.test.ts',
      'src/__tests__/guards.test.ts',
    ],
    fileParallelism: false,
    sequence: {
      sequencer: class {
        sort(files: { moduleId: string }[]) {
          return Promise.resolve(
            [...files].sort((a, b) => sortIndex(a.moduleId) - sortIndex(b.moduleId))
          );
        }
        shard(files: { moduleId: string }[]) {
          return Promise.resolve(files);
        }
      },
    },
    testTimeout: 120_000,
    hookTimeout: 300_000,
  },
});
