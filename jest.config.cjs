// JEST_CI_RUN=1 is set by test:staged (lint-staged pre-commit). In that mode,
// --findRelatedTests only runs the subset of tests for staged files, so global
// collectCoverageFrom would pull in unrelated source files with 0% coverage and
// blow the 100% threshold. Disable both for staged runs; full enforcement lives
// in test:coverage which runs the entire suite.
const isStagedRun = process.env.JEST_CI_RUN === "1";

module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.(ts)$": ["babel-jest", { rootMode: "upward" }],
    "^.+\\.(hbs)$": "<rootDir>/tests/hbsTransform.js"
  },
  moduleFileExtensions: ["ts", "js", "json", "hbs"],
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/tests/render-invoice.test.ts"],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'json', 'json-summary'],
  ...(isStagedRun ? {} : {
    coverageThreshold: {
      global: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
    collectCoverageFrom: [
      'src/**/*.{ts,js}',
      '!src/**/*.d.ts',
      '!src/**/index.ts',
    ],
  }),
};
