import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import boundaries from 'eslint-plugin-boundaries';
import tseslint from 'typescript-eslint';

// Architectural boundaries, enforced in CI rather than only in review.
// See IMPLEMENTATION.md §2: "gestures/ may not import from state/, ui/, or
// modules/". The engine must stay a pure function of landmarks -> gestures;
// the moment it reaches into React state or a DOM-adjacent module, it stops
// being unit-testable in isolation and the whole point of the split is lost.
const ELEMENT_TYPES = [
  { type: 'gestures', pattern: 'src/gestures/**' },
  { type: 'vision', pattern: 'src/vision/**' },
  { type: 'interaction', pattern: 'src/interaction/**' },
  { type: 'state', pattern: 'src/state/**' },
  { type: 'ui', pattern: 'src/ui/**' },
  { type: 'modules', pattern: 'src/modules/**' },
  { type: 'app', pattern: 'src/app/**' },
];

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      boundaries,
    },
    settings: {
      'boundaries/elements': ELEMENT_TYPES,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'boundaries/dependencies': [
        'error',
        {
          default: 'allow',
          policies: [
            {
              from: { element: { type: 'gestures' } },
              disallow: [
                { to: { element: { type: 'state' } } },
                { to: { element: { type: 'ui' } } },
                { to: { element: { type: 'modules' } } },
                { to: { element: { type: 'app' } } },
              ],
              message:
                'gestures/ is a pure landmark->gesture engine and must not import from {{dependency.type}}/. Route through interaction/ or a module instead.',
            },
            {
              from: { element: { type: 'vision' } },
              disallow: [
                { to: { element: { type: 'ui' } } },
                { to: { element: { type: 'modules' } } },
                { to: { element: { type: 'app' } } },
              ],
              message:
                'vision/ may publish into state/ (see the real-time loop in IMPLEMENTATION.md §3) but must stay decoupled from {{dependency.type}}/.',
            },
          ],
        },
      ],
    },
  },
);
