import antfu from '@antfu/eslint-config'

export default antfu({
  vue: true,
  typescript: true,
  formatters: true,
  ignores: ['.claude/**', 'openspec/**', 'public/**', 'dist/**', 'node_modules/**', 'worktrees/**'],
  rules: {
    'no-console': 'error',
  },
})
