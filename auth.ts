// Type augmentation lives in /next-auth.d.ts so TS picks it up reliably.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { cookies } from "next/headers";
import { users, userStats } from "@/db/schema";
import { adoptGuestAttempts, seedRollupsForNewUser } from "@/lib/quiz/adopt";

// Auth.js v5 setup. JWT session (no DB sessions table), 30-day cookie,
// Google as the only provider for v1. Local users live in our `users`
// table; the JWT carries the local numeric user id so the app side never
// has to round-trip Google's sub to look it up.
//
// Using the request-scoped config form so we can read AUTH_SECRET and the
// Google client id/secret via Cloudflare bindings (.dev.vars in dev,
// secrets in prod). process.env does not see those bindings in the
// OpenNext runtime.
export const { handlers, signIn, signOut, auth } = NextAuth(async () => {
  const { env } = await getCloudflareContext({ async: true });

  return {
    trustHost: true,
    secret: env.AUTH_SECRET,
    session: {
      strategy: "jwt",
      maxAge: 30 * 24 * 60 * 60, // 30 days
    },
    providers: [
      Google({
        clientId: env.AUTH_GOOGLE_ID,
        clientSecret: env.AUTH_GOOGLE_SECRET,
      }),
    ],
    callbacks: {
      async jwt({ token, account, profile }) {
        if (account && profile) {
          const db = drizzle(env.DB);

          const googleId = profile.sub;
          if (!googleId) {
            throw new Error("Google profile missing sub claim");
          }
          const email =
            typeof profile.email === "string" ? profile.email : null;
          const displayName =
            (typeof profile.name === "string" && profile.name) ||
            email ||
            "Player";

          const existing = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.googleId, googleId))
            .limit(1);

          // Read the guest cookie set by /quiz/play so we can adopt any
          // orphan quiz_attempts for this device into the user.
          const guestId =
            (await cookies()).get("stti.gid")?.value ?? null;

          let userId: number;
          let createdNew = false;
          if (existing.length > 0) {
            userId = existing[0].id;
          } else {
            const inserted = await db
              .insert(users)
              .values({ googleId, email, displayName })
              .returning({ id: users.id });
            userId = inserted[0].id;
            createdNew = true;
            // Defer the user_stats seed; if we end up adopting attempts
            // below, seedRollupsForNewUser writes a row that reflects them.
            // If no adoption happens, insert the default row here.
          }

          if (guestId) {
            const adopted = await adoptGuestAttempts(db, userId, guestId);
            if (createdNew && adopted > 0) {
              await seedRollupsForNewUser(db, userId);
            }
          }

          if (createdNew) {
            // Ensure a user_stats row exists even if no adoption happened.
            try {
              await db.insert(userStats).values({ userId });
            } catch {
              // already inserted by seedRollupsForNewUser or a prior retry.
            }
          }

          token.userId = userId;
        }
        return token;
      },
      async session({ session, token }) {
        if (typeof token.userId === "number") {
          (session as unknown as { userId: number }).userId = token.userId;
        }
        return session;
      },
    },
  };
});
