import { defineConfig } from "drizzle-kit";

// Only used to generate SQL migrations from src/schema.ts (`pnpm db:generate`).
// Migrations are applied at runtime by createDb(...).migrate().
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
});
