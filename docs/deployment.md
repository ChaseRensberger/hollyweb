# Deploy to separate exe.dev VMs

This guide uses two VMs managed through Komodo. Each VM runs one app container and keeps its own persistent volume.

| VM      | Public hostname          | Compose file                  |
| ------- | ------------------------ | ----------------------------- |
| Auth    | `auth.hollyweb.actor`    | `deploy/auth.compose.yaml`    |
| Bracket | `bracket.hollyweb.actor` | `deploy/bracket.compose.yaml` |

The domain names are examples. Public URLs come from environment configuration.

## Configure the domains

1. Create a CNAME from each app hostname to its VM hostname, such as `holly-auth.exe.xyz`.
2. Register each hostname with exe.dev:

   ```sh
   ssh exe.dev domain add holly-auth auth.hollyweb.actor
   ssh exe.dev domain add holly-bracket bracket.hollyweb.actor
   ```

3. Configure port 3000 on each VM:

   ```sh
   ssh exe.dev share port holly-auth 3000
   ssh exe.dev share port holly-bracket 3000
   ```

4. Make both app endpoints public:

   ```sh
   ssh exe.dev share set-public holly-auth
   ssh exe.dev share set-public holly-bracket
   ```

exe.dev terminates HTTPS. The app containers receive HTTP on port 3000. Hollyweb provides the application login.

With Cloudflare DNS, use DNS-only records for these CNAMEs. exe.dev requires the CNAME target for domain registration.

## Configure auth

1. Copy `deploy/auth.env.example` to `deploy/auth.env` on the auth VM, or supply those variables through Komodo.
2. Set `AUTH_ORIGIN` to the public HTTPS auth URL.
3. Set `AUTH_CLIENTS` to the exact Bracket callback:

   ```dotenv
   AUTH_CLIENTS={"bracket":["https://bracket.hollyweb.actor/auth/callback"]}
   ```

4. Register `https://auth.hollyweb.actor/google/callback` in the Google OAuth client.
5. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on the auth VM.
6. Deploy `deploy/auth.compose.yaml` through Komodo.

The Docker build context is the repository root. The Dockerfile is `apps/auth/Dockerfile`.

## Configure Bracket

1. Copy `deploy/bracket.env.example` to `deploy/bracket.env` on the Bracket VM, or supply those variables through Komodo.
2. Set `BRACKET_ORIGIN` to the public HTTPS Bracket URL.
3. Set `AUTH_ORIGIN` to the public HTTPS auth URL.
4. Keep `AUTH_CLIENT_ID=bracket` consistent with `AUTH_CLIENTS`.
5. Deploy `deploy/bracket.compose.yaml` through Komodo.

The Docker build context is the repository root. The Dockerfile is `apps/bracket/Dockerfile`.

Compose uses the local environment files by default. If Komodo supplies variables directly, replace `env_file` with the corresponding `environment` entries.

## Check a deployment

1. Request `https://auth.hollyweb.actor/health`.
2. Request `https://bracket.hollyweb.actor/health`.
3. Open Bracket and sign in with Google.
4. Create a bracket with 9 entrants.
5. Open its shared link in a private browser window.
6. Complete a guest run.
7. Sign in and save the run.
8. Restart both containers.
9. Open the saved run again.

Each health endpoint checks local database access. Bracket health does not require a request to the auth VM.

## Build and migration commands

The Docker entrypoints apply committed migrations before starting the server. Migration errors stop the container.

Local image builds use these commands:

```sh
docker build -f apps/auth/Dockerfile -t hollyweb-auth .
docker build -f apps/bracket/Dockerfile -t hollyweb-bracket .
```

A CI job can run these checks before an image build:

```sh
bun install --frozen-lockfile
bun run format:check
bun run lint
bun run typecheck
bun test
bun run build
```

The repository supplies deployment inputs. Registry publication and Komodo rollout triggers belong to the CI/CD configuration.

## Persistent data

| Container | Path                   | Contents                                                  |
| --------- | ---------------------- | --------------------------------------------------------- |
| Auth      | `/data/auth.sqlite`    | Users, central sessions, issuer keys, refresh-token state |
| Bracket   | `/data/bracket.sqlite` | Brackets, versions, picks, app sessions, upload records   |
| Bracket   | `/data/uploads/`       | Normalized entrant images                                 |

Each Compose file uses a named volume. Image rebuilds do not replace this data.

Use one running replica per app database. These files are local SQLite databases, not a shared database cluster.

For a file-based backup, stop the app container before copying its complete volume. Restart the container after the copy.

Restore the Bracket database and its upload directory from the same backup. Preserve the auth database to keep user identities and issuer keys.
