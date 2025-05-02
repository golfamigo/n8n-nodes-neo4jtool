/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Automatically clear mock calls and instances between every test
  clearMocks: true,
  // The directory where Jest should output its coverage files
  coverageDirectory: 'coverage',
  // Indicates which provider should be used to instrument code for coverage
  coverageProvider: 'v8',
  // A list of paths to directories that Jest should use to search for files in
  roots: [
    '<rootDir>/nodes' // Adjust if tests are located elsewhere
  ],
  // The test pattern Jest uses to detect test files
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$',
  // Module file extensions for importing
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  // Optional: Setup files to run before each test file
  // setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // Optional: Transform files with ts-jest
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      // ts-jest configuration options go here
      tsconfig: 'tsconfig.json', // Ensure it uses the correct tsconfig
    }],
  },
  // Optional: Ignore specific paths
  // testPathIgnorePatterns: ['/node_modules/'],
  // Optional: Map module names to paths
  // moduleNameMapper: {
  //   '^@/(.*)$': '<rootDir>/src/$1',
  // },
};
