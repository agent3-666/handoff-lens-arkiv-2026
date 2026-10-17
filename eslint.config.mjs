export default [
  {
    files: ["src/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        fetch: "readonly",
        Blob: "readonly",
        URL: "readonly",
        crypto: "readonly",
      },
    },
    rules: { "no-undef": "error", "no-global-assign": "error" },
  },
];
