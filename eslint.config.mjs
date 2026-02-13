import nextPlugin from 'eslint-config-next';

const eslintConfig = [
  {
    ignores: ["_old_project/**", ".next/**", "node_modules/**", "out/**", "build/**"],
  },
];

export default eslintConfig;
