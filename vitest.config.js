import { defineConfig } from 'vitest/config'

// Minimal config — the logic under test (src/lib/gradesEngine.js) is
// plain JS with no DOM dependency, so the default 'node' environment is
// enough. Switch to 'jsdom' later if component tests get added.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
