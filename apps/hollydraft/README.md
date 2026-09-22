# HollyDraft backend

HollyDraft supports private movie-draft leagues through a JSON API.
The [root specification](../../spec.md) records the game rules and their decision history.

## Run locally

From the repository root:

```sh
bun install
bun run db:migrate
bun run --filter @hollyweb/hollydraft data:import catalog/2027.json
bun run dev
```

The HollyDraft API runs at <http://localhost:3003>.
The root endpoint returns service information. The first release has no visual interface.

`bun run dev` starts auth, Bracket, and HollyDraft.
`bun run dev:hollydraft` starts only HollyDraft.

If an existing auth environment defines `AUTH_CLIENTS`, add the HollyDraft callback:

```json
{
  "bracket": ["http://localhost:3000/auth/callback"],
  "hollydraft": ["http://localhost:3003/auth/callback"]
}
```

Google still redirects to `http://localhost:3001/google/callback` on the central auth service.
HollyDraft has its own session cookie and verifies the `hollydraft` token audience.

## Initial catalog

`catalog/2027.json` contains 64 researched candidates, 13 poster-backed entries, and no gross reports.
Nine candidates have logos. The remaining candidates have no imported poster.
The default catalog excludes candidates without a qualifying poster.

```sh
curl 'http://localhost:3003/api/movies?season=2027'
curl 'http://localhost:3003/api/movies?season=2027&candidates=true'
curl 'http://localhost:3003/api/movies/shrek-5'
```

Each candidate contains its source URL and research date.
Individual Wikipedia pages provide release and poster details where available.
The American release list supplies provisional dates for candidates without complete individual pages.
The dataset uses the earliest supported theatrical date, including earlier international openings for CoComelon and The Beekeeper 2.

Poster captions distinguish official posters from logos and unrelated artwork.
The source images remain on Wikimedia. Direct image requests can encounter Wikimedia rate limits.
Four image URLs returned image bytes during the initial check. Subsequent requests encountered HTTP 429.
The source pages identify all 13 qualifying images as posters.

An eight-manager league with eight slots needs 64 qualifying movies before its draft can start.
The initial dataset supports smaller leagues, such as four managers with three slots each.
Editorial ranks determine automatic picks after a personal queue is empty. Ranks are not revenue forecasts.

## Imports

The import command uses the configured HollyDraft database.
Migrations must exist before the first import.

From `apps/hollydraft`:

```sh
bun run data:import catalog/2027.json --preview
bun run data:import catalog/2027.json
```

Preview runs the same validation inside a transaction, then rolls back all writes.
The importer rejects the whole batch if any record is invalid.
Identical batches and identical gross reports do not create duplicates.

### Catalog records

The schema is `movieInput` in `shared/rules.ts`.
The initial dataset provides complete examples.

| Field                  | Meaning                                                     |
| ---------------------- | ----------------------------------------------------------- |
| `id`                   | Stable lowercase movie identifier                           |
| `title`, `studio`      | Movie name and production or distribution label             |
| `season`               | Catalog season year                                         |
| `rank`                 | Positive editorial draft rank                               |
| `releaseDate`          | Earliest supported theatrical date, `YYYY-MM-DD`, or `null` |
| `releaseStatus`        | `scheduled`, `released`, or `canceled`                      |
| `source`               | HTTPS source for the release information                    |
| `researchedAt`         | ISO timestamp for the research                              |
| `poster`               | Image metadata or `null`                                    |
| `poster.url`           | HTTPS image URL                                             |
| `poster.source`        | HTTPS page that identifies the image                        |
| `poster.kind`          | `poster`, `teaser`, or `logo`                               |
| `imdbID`, `wikidataID` | Optional external identifiers                               |
| `correctionReason`     | Explicit reason for a correction to a recorded release lock |

Routine imports cannot postpone or cancel a recorded release lock.
A correction record requires `correctionReason` and a research timestamp at least as recent as the existing record.
The importer retains catalog revisions. League activity records changes to drafted movies.
Corrections do not reverse completed trades or alter finalized standings.
Season browsing follows the year in `releaseDate`, with `season` as the fallback for candidates without dates.
The `eligibilitySeason` response field identifies the season for the eligibility flags.
Movie details use the current release year. Roster responses use the league season.

### Gross reports

The following example uses synthetic values to illustrate the format:

```json
{
  "version": 1,
  "grosses": [
    {
      "movieID": "shrek-5",
      "amount": 123456789,
      "currency": "USD",
      "through": "2027-07-04",
      "observedAt": "2027-07-05T12:00:00Z",
      "source": "https://example.com/worldwide-report",
      "reason": "Optional explanation of a correction"
    }
  ]
}
```

`amount` is cumulative worldwide theatrical gross in whole USD.
`currency` defaults to `USD`. The importer rejects other currencies.
`through` identifies the final earnings date in the report.
`observedAt` identifies when the source supplied the figure.
Reports cannot describe future earnings or precede the theatrical release.

The latest reporting date takes precedence.
For the same reporting date, the latest observation takes precedence.
For equal observation timestamps, the later import takes precedence.
Downward corrections are valid. The service never adds cumulative reports together.
Scoring excludes reports before the current release date, including reports that become invalid after a release correction.
The source history retains those reports. Missing-report counts reflect the absence of a qualifying report.

The first release uses manual imports. It does not fetch daily figures automatically.
`lastImportAt` describes an import, not fresh earnings for every movie.
Movie details include the reporting dates, sources, and research history.

## API reference

All request and response bodies use JSON unless specified otherwise.
Private routes require the HollyDraft session cookie.
Every state-changing request requires an `Origin` header equal to `HOLLYDRAFT_ORIGIN`.

Errors use `{ "code": "STABLE_CODE", "error": "Description." }`.
HTTP 400 indicates invalid input. HTTP 401 requires login.
HTTP 403 indicates a forbidden operation. HTTP 404 conceals inaccessible league data.
HTTP 409 indicates a state conflict, such as an expired pick or closed trade.

### Identity and catalog

| Method | Path                           | Purpose                                                                |
| ------ | ------------------------------ | ---------------------------------------------------------------------- |
| GET    | `/health`                      | Service and database availability                                      |
| GET    | `/auth/login?returnTo=/api/me` | Begin Hollyweb login                                                   |
| GET    | `/auth/callback`               | OAuth callback                                                         |
| POST   | `/auth/logout`                 | End the local session                                                  |
| GET    | `/api/me`                      | Current user or `null`                                                 |
| GET    | `/api/movies`                  | Public catalog                                                         |
| GET    | `/api/movies/:movieID`         | Movie, release state, last 100 reports, and last 100 catalog revisions |
| GET    | `/api/invites/:token`          | Minimal invite preview                                                 |

Catalog parameters: `season`, `search`, `candidates=true`, `offset`, and `limit`.
The maximum page size is 200. Default order is editorial rank, then stable movie ID.
Responses include `total`, `draftable`, `movies`, `lastImportAt`, and `updateMode`.

### League and membership

| Method | Path                               | Request body                                                       |
| ------ | ---------------------------------- | ------------------------------------------------------------------ |
| GET    | `/api/leagues`                     | None. Lists the current user's leagues.                            |
| POST   | `/api/leagues`                     | `{ name, teamName, season, capacity?, slots?, pickSeconds? }`      |
| GET    | `/api/leagues/:id`                 | None. Returns league, current team, members, and cutoff.           |
| PATCH  | `/api/leagues/:id`                 | Any of `{ name, capacity, slots, pickSeconds }` before draft start |
| POST   | `/api/leagues/:id/invite`          | None. Replaces the invite and returns `{ token, expiresAt }`.      |
| DELETE | `/api/leagues/:id/invite`          | None. Revokes the invite.                                          |
| POST   | `/api/invites/:token/join`         | `{ name }` for the new team                                        |
| PATCH  | `/api/leagues/:id/team`            | `{ name }` for the current team                                    |
| DELETE | `/api/leagues/:id/members/:teamID` | None. Commissioner removes a lobby member.                         |

Defaults are eight managers, eight slots, and 60 seconds per pick.
Limits are 2–16 managers, 1–16 slots, and 15–300 seconds per pick.
The creator occupies one manager slot.

### Draft

| Method | Path                            | Request body                                        |
| ------ | ------------------------------- | --------------------------------------------------- |
| POST   | `/api/leagues/:id/draft/start`  | None. Commissioner starts the draft.                |
| GET    | `/api/leagues/:id/draft`        | None. Current state and complete pick history.      |
| POST   | `/api/leagues/:id/draft/pick`   | `{ movieID, expectedPick }`                         |
| POST   | `/api/leagues/:id/draft/pause`  | None. Commissioner pauses the draft.                |
| POST   | `/api/leagues/:id/draft/resume` | None. Commissioner resumes the draft.               |
| GET    | `/api/leagues/:id/queue`        | None. Only the current manager's queue.             |
| PUT    | `/api/leagues/:id/queue`        | `{ movies: [movieID, ...] }`, maximum 1,000 entries |

`expectedPick` is the one-based overall pick number.
The server returns HTTP 409 if the pick changes before the request commits.
The client must reload the draft after a conflict.

Draft state includes `order`, `pool`, `nextPick`, `currentTeamID`, `deadline`, `paused`, `remaining`, `pauseReason`, `serverTime`, and `picks`.
Timestamps and durations use milliseconds.
The server persists deadlines and resolves timeout picks without a connected client.

### Rosters, trades, and results

| Method | Path                                      | Request body                                                     |
| ------ | ----------------------------------------- | ---------------------------------------------------------------- |
| GET    | `/api/leagues/:id/rosters`                | None. All league rosters and release states.                     |
| GET    | `/api/leagues/:id/trades`                 | None. Up to 100 recent offers.                                   |
| POST   | `/api/leagues/:id/trades`                 | `{ recipientID, give: [movieID, ...], receive: [movieID, ...] }` |
| POST   | `/api/leagues/:id/trades/:tradeID/accept` | None. Recipient only.                                            |
| POST   | `/api/leagues/:id/trades/:tradeID/reject` | None. Recipient only.                                            |
| POST   | `/api/leagues/:id/trades/:tradeID/cancel` | None. Sender only.                                               |
| GET    | `/api/leagues/:id/standings`              | None. Dollar totals, points, ranks, and missing-report counts.   |
| POST   | `/api/leagues/:id/finalize`               | `{ acknowledgeMissing?: boolean }`, default `false`              |

`recipientID` is a team ID, not a user ID.
Trades contain equal movie counts and preserve roster size.
Release locks apply at 00:00 UTC on the earliest supported theatrical date.

### Activity and live events

`GET /api/leagues/:id/activity?after=0` returns up to 100 events in ascending ID order.
The response includes `next` for the next page.

`GET /api/leagues/:id/events` returns an authenticated SSE stream.
`Last-Event-ID` or `?after=<eventID>` resumes event replay.
The event payload contains `id`, `leagueID`, `type`, `data`, and `createdAt`.
Heartbeats contain `serverTime` and have no event ID.

The stream reconnects every minute to recheck authentication.
Clients must treat event IDs as deduplication keys and reload snapshots after reconnects.
The reverse proxy must disable response buffering for this endpoint.

## Deployment

`deploy/hollydraft.compose.yaml` runs one service replica with a persistent SQLite volume.
The container uses port 3000 internally. Compose exposes port 3003.
The service runs migrations before it starts.

The production configuration requires HTTPS `HOLLYDRAFT_ORIGIN` and `AUTH_ORIGIN`.
The central auth registry must contain the exact public HollyDraft callback.
The example domain is a placeholder for the user's deployment.

From the repository root:

```sh
cp deploy/hollydraft.env.example deploy/hollydraft.env
```

After the environment file contains the public origins:

```sh
docker compose -f deploy/hollydraft.compose.yaml up -d --build
docker compose -f deploy/hollydraft.compose.yaml exec hollydraft bun run data:import catalog/2027.json
```

The first deployment uses one process and local SQLite storage.
The background job runs every second and resolves draft deadlines, release locks, and expired offers.
After a restart, an overdue draft resolves one pick and gives the next manager a full timer.

## Verification

From the repository root:

```sh
bun test apps/hollydraft
bun run typecheck
bun run lint
bun run format:check
bun run build
```

Tests use temporary databases and a controlled clock.
The auth integration uses a real local issuer with an isolated test SSO session.
Live Google login still requires Google credentials.
