# Authentication and data boundaries

## Central identity

The auth app owns Hollyweb users. A Google subject maps to one stable Hollyweb user ID. Email changes do not create a new identity.

OpenAuth provides OAuth endpoints and token signatures. Drizzle manages the users, central sessions, and persistent OpenAuth storage in `auth.sqlite`.

The auth service keeps signing keys and refresh-token state across restarts. Bracket has no access to the auth database.

## Login flow

1. Bracket creates a short-lived login record with OAuth state, a PKCE verifier, and the return path.
2. The browser redirects to the registered Hollyweb issuer.
3. Auth accepts an existing central session or redirects the browser to Google.
4. Auth returns a one-use authorization code to the registered Bracket callback.
5. Bracket consumes the login record and exchanges the code.
6. Bracket checks the token signature, issuer, subject schema, and app audience.
7. Bracket creates its own server-side session and sends an HttpOnly cookie.

The auth service accepts only registered callbacks and the authorization-code flow with PKCE S256.

OpenAuth 0.4.3 exposes an audience option but does not enforce it. `apps/auth/src/client.ts` explicitly checks the verified audience claim.

Browser cookies contain opaque session identifiers. Production cookies use the `__Host-` prefix, HTTPS, HttpOnly, and SameSite Lax.

Auth and Bracket keep separate host-only cookies. Future apps obtain local sessions through the central issuer. They do not share a parent-domain cookie.

Bracket logout removes the local app session. The account page can also remove the central login session. Existing sessions in other apps remain active.

## Add another app

1. Add an app ID and its exact callback URL to `AUTH_CLIENTS`.
2. Configure the new app with the same `AUTH_ORIGIN`.
3. Implement the code flow with PKCE and a server-side session.
4. Use `verifyUser` from `@hollyweb/auth/client` to check tokens for the new app ID.

The auth package exports its client contract without importing the auth database or Google credentials.

## Bracket data

`bracket.sqlite` contains brackets, immutable versions, saved runs, upload ownership, app sessions, and pending login records.

A version contains the title, description, and ordered entrants. Each run references one version and stores its own picks.

The server checks picks against the tournament rules before saving. Optimistic revision numbers prevent concurrent tabs from overwriting each other.

The browser stores a complete version snapshot for a guest run. A later bracket edit does not change that local run.

Core owns generic UI behavior and styling. Bracket owns the editor, matchup cards, tournament tree, routes, and data requests.

## HollyDraft data

HollyDraft owns `hollydraft.sqlite` and uses the registered `hollydraft` OAuth client.
Its local callback is `http://localhost:3003/auth/callback`.
Its cookies use the `hollydraft-session` and `hollydraft-flow` names, with the `__Host-` prefix on HTTPS origins.

The database stores the shared movie catalog, sourced gross reports, leagues, teams, drafts, rosters, trades, and activity events.
SQLite transactions protect draft picks, invite capacity, trade transfers, and final standings.
Persisted deadlines survive restarts. Authenticated SSE streams replay persisted league events.

The first data workflow uses researched JSON imports. Automatic daily source fetching comes later.
The [HollyDraft reference](../apps/hollydraft/README.md) defines the API and deployment commands.
