import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";

export async function getDb() {
  const { env } = await getCloudflareContext({ async: true });
  return drizzle(env.DB);
}

export async function getEnv() {
  const { env } = await getCloudflareContext({ async: true });
  return env;
}
