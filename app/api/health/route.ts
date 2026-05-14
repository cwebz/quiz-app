import { getCloudflareContext } from "@opennextjs/cloudflare";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { questions } from "@/db/schema";

export async function GET() {
  const { env } = await getCloudflareContext({ async: true });
  const db = drizzle(env.DB);

  const tablesResult = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%' AND name NOT LIKE '_cf_%' ORDER BY name",
  ).all<{ name: string }>();

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(questions);

  await env.QUIZ_KV.put("health:check", "ok");
  const kvCheck = await env.QUIZ_KV.get("health:check");
  await env.QUIZ_KV.delete("health:check");

  return Response.json({
    ok: true,
    questionCount: count,
    kv: kvCheck === "ok" ? "ok" : "fail",
  });
}
