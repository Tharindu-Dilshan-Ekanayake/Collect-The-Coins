import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // R3F scene code mutates three.js / Rapier objects (uniforms, rays, cameras) inside
    // useFrame on purpose: that is how it animates without React re-renders. This
    // React Compiler rule assumes hook values are immutable, and the compiler is not
    // enabled in this project.
    files: ['src/game/**/*.{js,jsx}', 'src/net/**/*.{js,jsx}'],
    rules: { 'react-hooks/immutability': 'off' },
  },
])
