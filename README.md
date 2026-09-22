# Hollyweb

A Bun monorepo for Bracket and HollyDraft, with a central authentication service and a shared React component library.

## Run locally

Use Bun 1.3.14 or a compatible newer release.

```sh
bun install
bun run db:migrate
bun run dev
```

| Service        | URL                                              |
| -------------- | ------------------------------------------------ |
| Bracket        | <http://localhost:3000>                          |
| Hollyweb auth  | <http://localhost:3001>                          |
| Core gallery   | <http://localhost:3002> (run `bun run dev:core`) |
| HollyDraft API | <http://localhost:3003>                          |

The migration command also creates a playable example at `/b/comfort-food`. Guests can complete it without an account.

HollyDraft starts with an empty catalog. Import its researched 2027 dataset with:

```sh
bun run --filter @hollyweb/hollydraft data:import catalog/2027.json
```

The dataset contains 64 candidates and 13 qualifying posters. See the [HollyDraft API reference](apps/hollydraft/README.md).

### Enable Google login

1. Copy `apps/auth/.env.example` to `apps/auth/.env`.
2. Create a Google OAuth client with the **Web application** type.
3. Register `http://localhost:3001/google/callback` as an authorized redirect URI.
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the auth configuration.
5. Restart the auth server.

Google credentials stay on the auth server. Bracket receives a Hollyweb user identity through an authorization-code flow with PKCE.

## Workspace

```text
apps/
  auth/       Central login, Google provider, users, sessions, issuer storage
  bracket/
    client/   React, TanStack Router, Query, and Form
    server/   Hono API, Drizzle, uploads, app sessions
    shared/   Bracket rules and Zod schemas
  hollydraft/
    server/   League API, drafts, trades, scoring, imports, and app sessions
    shared/   Game rules and request schemas
    catalog/  Sourced movie imports
packages/
  core/       Base UI components, Holly styles, themes, and 53 showcases
deploy/       Separate Compose definitions for each service
```

Core preserves the component APIs from Wingman. Holly uses its own charcoal and muted-red palette, Geist typography, small radii, and component styling.

Apps import components and utilities through package exports:

```tsx
import { Button } from "@hollyweb/core/components/core/button";
import { cn } from "@hollyweb/core/lib/utils";
import "@hollyweb/core/globals.css";
```

Each consumer CSS file includes an `@source` directive for Core. Each frontend workspace also configures the Bun Tailwind plugin in `bunfig.toml`.

TanStack Router uses typed, code-based routes. The router version is pinned because newer cyclic router modules fail in the Bun 1.3 development bundler.

Bracket disables browser HMR because Bun 1.3.14 can show a blank page when a stylesheet link has no URL. Refresh the browser after frontend edits. Server changes still restart through `bun --watch`.

## Commands

| Command                  | Purpose                                 |
| ------------------------ | --------------------------------------- |
| `bun run dev`            | Run auth, Bracket, and HollyDraft       |
| `bun run dev:auth`       | Run auth only                           |
| `bun run dev:bracket`    | Run Bracket only                        |
| `bun run dev:hollydraft` | Run the HollyDraft API only             |
| `bun run dev:core`       | Run the component gallery               |
| `bun run build`          | Build all apps and the gallery          |
| `bun run typecheck`      | Run TypeScript checks in all workspaces |
| `bun run lint`           | Run Oxlint and reject warnings          |
| `bun run format`         | Format the repository with Oxfmt        |
| `bun run format:check`   | Check formatting                        |
| `bun test`               | Run game, API, and auth tests           |
| `bun run db:migrate`     | Apply migrations to all app databases   |

Each app also provides `db:generate` and `db:migrate` commands. Run `db:generate` from the app directory after a schema change. Commit the generated SQL and metadata.

## Bracket behavior

- Brackets accept any whole-number entrant count from 8 through 64.
- Creators order seeds manually or shuffle them before saving.
- Standard tournament seeding gives first-round byes to the highest seeds.
- Each entrant has a name and an optional image.
- The server converts uploads to WebP and limits their dimensions to 1200 pixels.
- Shared links start independent runs. Brackets have no public directory.
- Guests keep picks in browser storage. After login, **Save to my account** imports the run.
- Saved runs update after each pick.
- Earlier pick changes clear dependent later picks.
- Each bracket edit creates an immutable version. Existing runs retain their original version.
- Concurrent edits return a conflict instead of overwriting another tab.
- Disabling sharing stops new visitors. Existing saved runs remain available.
- Deleting a bracket also deletes its versions and saved runs.

Uploaded files remain on disk after bracket deletion. This first version does not include an orphan-image cleanup job.

## Further information

- [Deploy separate apps with Komodo on exe.dev](docs/deployment.md)
- [Authentication and data boundaries](docs/architecture.md)
