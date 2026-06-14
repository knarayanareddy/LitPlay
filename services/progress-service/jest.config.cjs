/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@litplay/contracts$': '<rootDir>/../../packages/contracts/src/index.ts',
    '^@litplay/server-kit$': '<rootDir>/../../packages/server-kit/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        moduleResolution: 'node',
        esModuleInterop: true,
        target: 'ES2022',
        strict: true,
        skipLibCheck: true,
      },
    }],
  },
};
