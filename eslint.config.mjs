// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'
import prettierConfig from 'eslint-config-prettier/flat'

export default withNuxt({
  rules: {
    'comma-dangle': 'off',
    semi: ['error', 'never'],
    'vue/html-indent': 'off',
    '@stylistic/comma-dangle': 'off',
    '@stylistic/no-trailing-spaces': 'off',
    '@stylistic/arrow-parens': 'off',
    '@stylistic/indent': 'off',
    'vue/max-attributes-per-line': 'off',
    'vue/block-tag-newline': 'off',
    'vue/html-closing-bracket-newline': 'off',
    'vue/html-closing-bracket-spacing': 'off',
    'vue/html-comment-content-newline': 'off',
    'vue/html-comment-content-spacing': 'off',
    'vue/html-comment-indent': 'off',
    'vue/html-end-tags': 'off',
    'vue/first-attribute-linebreak': 'off',
    'nuxt/nuxt-config-keys-order': 'off',
    '@typescript-eslint/no-unused-vars': 'warn',
    'vue/singleline-html-element-content-newline': 'off',
    curly: ['error', 'all'],
    'brace-style': ['error', '1tbs', { allowSingleLine: false }],
    'max-statements-per-line': ['error', { max: 1 }],
    'vue/html-self-closing': 'off',
    '@stylistic/member-delimiter-style': 'off',
    'vue/block-order': [
      'error',
      {
        order: ['script', 'template', 'style']
      }
    ],
    'vue/multi-word-component-names': 'off'
  }
}).append(
  prettierConfig,
  {
    rules: {
      curly: ['error', 'all'],
      'brace-style': ['error', '1tbs', { allowSingleLine: false }],
      'max-statements-per-line': ['error', { max: 1 }],
      'vue/html-self-closing': 'off',
      '@stylistic/member-delimiter-style': 'off'
    }
  },
  {
    files: ['**/*.vue'],
    rules: {
      'max-statements-per-line': 'off'
    }
  }
)
