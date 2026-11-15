import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["app.js", "z-tools-panel.js", "z-day-badge.js", "z-code-lab.js", "z-paper-ui.js", "z-install-guide.js", "z-shell.js", "z-auth-ui.js", "z-auth-config.js", "lib/**/*.js", "tests/**/*.js", "browser-tests/**/*.js", "playwright.config.js", "scripts/**/*.mjs", "vitest.config.js", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
    },
  },
  {
    ignores: [
      "node_modules/**",
      "gemma-4-e2b.js",
      "bonsai-27b.js",
      "lfm2_5.js",
      "research-e4b/**",
      "local-analysis.js",
      "reference-implementation.html",
    ],
  },
];
