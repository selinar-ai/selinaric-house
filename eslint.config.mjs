import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Non-project trees that ESLint should never scan:
    ".venv-whisper/**", // Python venv (Whisper) — ships its own JS assets
    ".vercel/**",
    "piper-server/**",
  ]),
  {
    // react-hooks v6 advisory rule: flags the fetch-on-mount pattern used
    // throughout the House UI. Restructuring that data flow everywhere is not
    // worth the regression risk on governed surfaces — keep it visible as a
    // warning instead of an error.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    // Operational scripts, phase validation scripts, and tests: `any` and
    // require() are tolerated there (Node CLI context, historical phase
    // artifacts). Production src/ stays at error severity.
    files: ["scripts/**", "test-*.js", "src/**/__tests__/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
