import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'functions/mcp/build']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      // The i18n hook lives next to its provider; editing that file reloads the page
      'react-refresh/only-export-components': ['error', { allowConstantExport: true, allowExportNames: ['useI18n'] }],
    },
  },
  // Cloud Functions: CommonJS on Node, except the ESM entry bundled from src/lib
  {
    files: ['functions/**/*.js'],
    ignores: ['functions/mcp/oshka.entry.js'],
    languageOptions: {
      globals: globals.node,
      sourceType: 'commonjs',
    },
  },
])
