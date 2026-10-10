import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'dev-dist', 'coverage']),
  {
    // Code applicatif (navigateur)
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
    rules: {
      // Convention : un identifiant préfixé par « _ » est volontairement ignoré
      // (ex. `const { [id]: _removed, ...rest } = obj`).
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^_',
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
    },
  },
  {
    // Fichiers de configuration à la racine (ESM exécutés par Node)
    files: ['*.config.{js,mjs}', 'scripts/**/*.{js,mjs}'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.node,
    },
  },
  {
    // Scripts CommonJS (require / module.exports)
    files: ['fix_toast.js', '**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
  },
  {
    // Tests unitaires (node:test)
    files: ['src/**/tests/**/*.js', 'src/**/*.test.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
])
