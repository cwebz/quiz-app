import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

function findLocalD1() {
  const basePath = resolve(".wrangler/state/v3/d1");
  if (!existsSync(basePath)) {
    throw new Error(
      "Local D1 not found. Run `npm run db:local` first to bootstrap it.",
    );
  }
  const sqliteFile = readdirSync(basePath, {
    encoding: "utf-8",
    recursive: true,
  }).find((f) => typeof f === "string" && f.endsWith(".sqlite"));
  if (!sqliteFile) {
    throw new Error(`No .sqlite file under ${basePath}`);
  }
  return resolve(basePath, sqliteFile);
}

export default defineConfig({
  schema: "./db/schema/*.ts",
  out: "./migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: findLocalD1(),
  },
});
