import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts?$': [
      'ts-jest',
      {
        useESM: false,
        tsconfig: {
          module: 'CommonJS',
          isolatedModules: true,
        },
      },
    ],
  },
  testMatch: [
    '**/src/**/*.test.ts'
  ],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  moduleFileExtensions: ['ts', 'js'],
  collectCoverage: true,
  collectCoverageFrom: [
    '<rootDir>/src/**/*.ts',
    '!<rootDir>/src/config/**',
    '!<rootDir>/**/index.ts',
    '!<rootDir>/src/Graph/Rules/registerAll.ts'
  ],
  coverageThreshold: {
    global: {
      statements: 100,
      branches: 100,
      lines: 100,
      functions: 100
    }
  },
  // setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  clearMocks: true,
};

export default config;
