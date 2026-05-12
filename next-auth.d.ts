// Augments next-auth types with our local user id. Loaded ambiently
// because the file is at the project root and tsconfig includes **/*.ts.

import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    userId: number;
    user: DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    userId?: number;
  }
}
