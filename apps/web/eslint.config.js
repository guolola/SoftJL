import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Imported UI is checked by TypeScript and its source fingerprint/structure tests.
    ignores: ["dist", "node_modules", "src/features/standard-project/components/home-demo/source/**"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        ignoreRestSiblings: true,
      }],
    },
  },
  {
    files: ["src/features/standard-project/components/home-demo/integration/base-{dialog,popover,tooltip}.tsx"],
    // These adapters mirror Base UI's namespace-based component and prop type exports.
    rules: { "@typescript-eslint/no-namespace": "off" },
  },
  {
    // Preserve the imported polymorphic animation template's dynamic Motion tag types.
    files: ["src/features/user-platform/components/bento-grid-25/motion-preset.tsx"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
