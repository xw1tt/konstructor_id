// 0.31: линтер — typescript-eslint (recommended). Запуск: npm run lint.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "dist/**", "build/**", "packages/addin/dist/**", "installer/**", "**/*.min.js"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser, Office: "readonly", Excel: "readonly" },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      // Неразрывные пробелы в регулярных выражениях — намеренно (нормализация текста документов).
      "no-irregular-whitespace": ["error", { skipRegExps: true, skipStrings: true, skipTemplates: true }],
      // any в коде программы — в основном обмен с Office.js без типов; видно в выводе линта, но не блокирует.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    files: ["**/test/**", "scripts/**"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
