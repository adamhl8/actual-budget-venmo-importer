import { oxlintConfig } from "@adamhl8/configs"
import { defineConfig } from "oxlint"

const config = oxlintConfig({
  // The state/session files and Venmo API model null as a first-class value.
  rules: {
    "unicorn/no-null": "off",
  },
  // Sequential-by-necessity loops: retry backoff and cursor-based pagination.
  overrides: [
    {
      files: ["src/venmo/client.ts", "src/sync.ts"],
      rules: {
        "no-await-in-loop": "off",
      },
    },
  ],
})

export default defineConfig(config)
