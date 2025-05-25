export default {
  testEnvironment: 'node',
  transform: {},
  testMatch: [
    '**/test/**/*.test.js'
  ],
  collectCoverageFrom: [
    'lib/**/*.js',
    '!**/node_modules/**'
  ]
}; 