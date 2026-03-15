const js = require('@eslint/js')
const globals = require('globals')
const tseslint = require('typescript-eslint')

module.exports = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.jquery,
        L: 'readonly',
        map: 'readonly',
        GM_info: 'readonly',
        PLAYER: 'readonly',
        dialog: 'readonly'
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_'
        }
      ],
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  }
]
