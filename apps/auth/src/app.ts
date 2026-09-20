import { issuer } from "@openauthjs/openauth";
import { GoogleProvider } from "@openauthjs/openauth/provider/google";
import type { Provider } from "@openauthjs/openauth/provider/provider";
import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { html } from "hono/html";
import { secureHeaders } from "hono/secure-headers";
import { eq, lt } from "drizzle-orm";
import { z } from "zod";
import type { AuthConfig } from "./config";
import type { AuthDatabase } from "./db";
import { users, sessions } from "./schema";
import { sqliteStorage } from "./storage";
import { subjects } from "./subjects";

const hash = (value: string) => new Bun.CryptoHasher("sha256").update(value).digest("hex");
const googleProfile = z.object({
  sub: z.string(),
  email: z.email(),
  email_verified: z.literal(true),
  name: z.string(),
});
const lifetime = 60 * 60 * 24 * 30;

export function createAuthApp(db: AuthDatabase, config: AuthConfig) {
  const app = new Hono();
  const secure = config.origin.startsWith("https://");
  const cookieName = secure ? "__Host-holly-sso" : "holly-sso";
  const cookieOptions = { httpOnly: true, secure, sameSite: "Lax" as const, path: "/" };
  app.use("*", secureHeaders());
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });
  app.get("/health", (c) => {
    db.select({ id: users.id }).from(users).limit(1).all();
    return c.json({
      status: "ok",
      service: "hollyweb-auth",
      googleConfigured: Boolean(config.clientID),
    });
  });
  app.use("/authorize", async (c, next) => {
    const clientID = c.req.query("client_id") ?? "";
    const redirectURI = c.req.query("redirect_uri") ?? "";
    if (!config.clients[clientID]?.includes(redirectURI))
      return c.json({ error: "Unauthorized client or redirect URL." }, 400);
    if (
      c.req.query("response_type") !== "code" ||
      c.req.query("code_challenge_method") !== "S256" ||
      !c.req.query("code_challenge")
    )
      return c.json({ error: "Use the authorization-code flow with PKCE (S256)." }, 400);
    await next();
  });
  app.get("/", (c) =>
    c.html(
      html`<!doctype html>
        <html lang="en">
          <meta charset="utf-8" /><meta
            name="viewport"
            content="width=device-width,initial-scale=1"
          /><title>Hollyweb account</title
          ><style>
            body {
              margin: 0;
              background: #151416;
              color: #e9e5e5;
              font: 16px system-ui;
              display: grid;
              min-height: 100vh;
              place-items: center;
            }
            main {
              max-width: 400px;
              padding: 40px;
              border: 1px solid #343033;
              border-top: 3px solid #a84c53;
              border-radius: 4px;
            }
            h1 {
              letter-spacing: -1px;
            }
            p {
              color: #aaa1a4;
              line-height: 1.6;
            }
            button {
              background: #a84c53;
              color: white;
              border: 0;
              padding: 12px 18px;
              border-radius: 4px;
              cursor: pointer;
            }
          </style>
          <main>
            <h1>Hollyweb account</h1>
            <p>Sign in through a Hollyweb app.</p>
            <form action="/logout" method="post"><button>Sign out of Hollyweb login</button></form>
          </main>
        </html>`,
    ),
  );
  app.post("/logout", (c) => {
    if (c.req.header("origin") !== config.origin) return c.json({ error: "Invalid origin." }, 403);
    const token = getCookie(c, cookieName);
    if (token)
      db.delete(sessions)
        .where(eq(sessions.hash, hash(token)))
        .run();
    deleteCookie(c, cookieName, cookieOptions);
    return c.redirect("/");
  });

  const provider: Provider<{ userID: string }> = {
    type: "google",
    init(routes, options) {
      routes.get("/authorize", async (c, next) => {
        const token = getCookie(c, cookieName);
        if (token) {
          const session = db
            .select()
            .from(sessions)
            .where(eq(sessions.hash, hash(token)))
            .get();
          if (session && session.expiresAt > Date.now())
            return options.success(c, { userID: session.userID });
        }
        if (!config.clientID || !config.clientSecret)
          return c.text(
            "Google login is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the auth server.",
            503,
          );
        return next();
      });
      GoogleProvider({
        clientID: config.clientID,
        clientSecret: config.clientSecret,
        scopes: ["openid", "email", "profile"],
        pkce: true,
      }).init(routes, {
        ...options,
        async success(c, properties) {
          const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
            headers: { Authorization: `Bearer ${properties.tokenset.access}` },
          });
          if (!response.ok)
            return c.text("Google could not verify this account. Please try again.", 502);
          const profile = googleProfile.parse(await response.json());
          const existing = db.select().from(users).where(eq(users.googleID, profile.sub)).get();
          const userID = existing?.id ?? crypto.randomUUID();
          db.insert(users)
            .values({
              id: userID,
              googleID: profile.sub,
              email: profile.email,
              name: profile.name,
              createdAt: Date.now(),
            })
            .onConflictDoUpdate({
              target: users.googleID,
              set: { email: profile.email, name: profile.name },
            })
            .run();
          const token = crypto.randomUUID() + crypto.randomUUID();
          db.delete(sessions).where(lt(sessions.expiresAt, Date.now())).run();
          db.insert(sessions)
            .values({ hash: hash(token), userID, expiresAt: Date.now() + lifetime * 1000 })
            .run();
          setCookie(c, cookieName, token, { ...cookieOptions, maxAge: lifetime });
          return options.success(c, { userID });
        },
      });
    },
  };

  app.route(
    "/",
    issuer({
      subjects,
      providers: { google: provider },
      storage: sqliteStorage(db),
      ttl: { access: 60 * 10, refresh: lifetime, retention: 60 * 60 * 24 },
      allow: async ({ clientID, redirectURI }) =>
        config.clients[clientID]?.includes(redirectURI) ?? false,
      async success(ctx, value) {
        const user = db.select().from(users).where(eq(users.id, value.userID)).get();
        if (!user) return new Response("Account not found.", { status: 401 });
        return ctx.subject(
          "user",
          { userID: user.id, name: user.name, email: user.email },
          { subject: `user:${user.id}` },
        );
      },
    }),
  );
  return app;
}
