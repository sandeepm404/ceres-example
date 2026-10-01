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
    "^.+\\.(hbs)$": "<rootDir>/tests/hbsTransform.js",
  },
  moduleFileExtensions: ["ts", "js", "json", "hbs"],
  // Templates and widgets import their stylesheet as a side effect; jest has no
  // bundler to resolve raw CSS, so stub it the way webpack's css-loader would
  // for test purposes — its contents are not under test here.
  moduleNameMapper: {
    "\\.css$": "<rootDir>/tests/styleMock.js",
  },
  testPathIgnorePatterns: ["/node_modules/"],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "json", "json-summary"],
  ...(isStagedRun
    ? {}
    : {
        coverageThreshold: {
          global: {
            branches: 100,
            functions: 100,
            lines: 100,
            statements: 100,
          },
        },
        collectCoverageFrom: [
          "src/**/*.{ts,js}",
          "!src/**/*.d.ts",
          "!src/**/index.ts",
        ],
      }),
};
