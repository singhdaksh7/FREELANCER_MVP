import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { loginSchema } from "@/lib/validation/auth";
import { verifyCredentials } from "@/data-access/credentials";

/**
 * Auth.js (NextAuth v5) config: Credentials provider + JWT sessions.
 *
 * No database adapter is configured. The Credentials provider is
 * incompatible with Auth.js's "database" session strategy (Auth.js
 * refuses to persist arbitrary credentials-based sessions server-side by
 * default), so this project intentionally uses JWT sessions and looks up
 * the user itself inside `authorize()` — see AUTH_DATABASE_ARCHITECTURE.md
 * for the full reasoning. Because there's no adapter, no Account/Session/
 * VerificationToken tables exist in the schema; they're simply unused by
 * this session strategy.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = loginSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;
        // Only the minimum needed for the session JWT — never passwordHash.
        return verifyCredentials(parsed.data.email, parsed.data.password);
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role as string;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
});
