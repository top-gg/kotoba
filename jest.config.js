module.exports = {
  name: "kotoba",
  // preset: "ts-jest",
  // automock: false,
  collectCoverage: true,
  // reporters: ["default", "jest-junit"],
  testPathIgnorePatterns: ["dist/.*", "node_modules"],
  maxWorkers: 1,
  transform: {
    "src/.+\\.(t|j)sx?$": "@swc/jest",
  },
}
