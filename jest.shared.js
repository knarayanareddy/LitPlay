/** Shared Jest config for all Node.js services.
 *  Resolves @litplay/* workspace packages to their source/dist. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname_cjs = typeof __dirname !== 'undefined'
  ? __dirname
  : dirname(fileURLToPath(import.meta.url));

/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@litplay/contracts$': resolve(__dirname_cjs, '../../packages/contracts/src/index.ts'),
    '^@litplay/server-kit$': resolve(__dirname_cjs, '../../packages/server-kit/src/index.ts'),
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
  },
};
