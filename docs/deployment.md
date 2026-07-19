# Production deployment

The production shape is a Vite static deployment on Vercel, one guarded Node
function at `POST /api/session`, and a separate object-store/CDN origin for
baked media and conditioning references. Reactor, Turnstile validation, Redis,
pipeline, and object-store credentials are never needed by the browser or
build. The Turnstile **site key** is intentionally public; it is not a secret.

## Deploy the static app and session broker

1. Import this repository into Vercel and set **Root Directory** to
   `revolution` (or run `npx vercel --cwd revolution` from a fresh clone).
2. Keep the build settings from `revolution/vercel.json`: `npm run build` and
   output directory `dist`.
3. Complete the Turnstile and Redis setup below, then add every required
   production environment variable. Use the narrower authenticated-preview
   configuration below only when live paid sessions from previews are
   intentional.
4. Deploy. Verify that `GET /api/session` returns `405`, an unchallenged POST
   returns the explicit `428 challenge_required` contract without calling
   Siteverify or Reactor, and a missing policy variable makes POST fail closed
   with `503`.
5. Open `/`, `/spikes/splat/`, and `/spikes/worldmodel/`. In the world-model
   spike, connect, wait for moving video, and verify WASD/arrows affect the
   stream before disconnecting. A token response alone does not prove WebRTC.

### Authenticated preview sessions

Preview deployments may skip Turnstile only while Vercel Authentication stays
enabled. Configure `SESSION_PREVIEW_BYPASS=1` and
`VITE_SESSION_CHALLENGE_MODE=disabled` in the Vercel **Preview** environment,
never Production. The API accepts the bypass only when Vercel also supplies
`VERCEL=1` and `VERCEL_ENV=preview`; both configured switches are required, and
the public browser flag cannot enable the server bypass by itself. The Vite
build also embeds Vercel's deployment environment, so an accidental Production
copy of the public disable flag cannot suppress the production challenge.

Preview still requires `REACTOR_API_KEY`, both Upstash values, a distinct
`SESSION_CLIENT_HASH_SECRET`, and all three explicit limits. Use stricter
limits than production. Preview counters use `iw:{session-broker-preview}` so
they cannot consume production's Redis counters, although successful preview
requests still consume Reactor capacity. Removing either bypass variable makes
preview fail closed again.

## Paid-session abuse controls

Production uses a verify-once browser clearance while retaining independent
server-enforced admission before every Reactor mint:

1. The client first sends its normal bodyless `POST /api/session`. With no valid
   clearance, the broker returns `428`, JSON code `challenge_required`, and
   header `X-Session-Challenge: turnstile`. It does not call Siteverify,
   Redis admission, or Reactor for a missing credential.
2. A singleflight client flow renders one Turnstile widget with action
   `session`. It sends that response once to the broker. The broker performs
   canonical server-side Siteverify, including action, exact hostname, and the
   Vercel-provided client address.
3. One Upstash Redis Lua transaction consumes the SHA-256 challenge hash,
   enforces the fixed-window per-client and UTC-daily global limits, and stores
   only an HMAC-SHA-256 hash of a new cryptographically random opaque
   clearance. The response contains the requested Reactor JWT and sets the raw
   clearance only in an `HttpOnly; Secure; SameSite=Strict` cookie scoped to
   `Path=/api/session`.
4. Later POSTs send that cookie automatically. A separate atomic Lua
   transaction requires the hashed clearance to exist, applies the same client
   and global admission limits, and renews its Redis TTL only after successful
   validation and admission. No widget or Siteverify call occurs. The broker
   then mints a fresh short-lived Reactor JWT and renews the cookie `Max-Age`.

All Redis keys use one hash tag so validation, renewal, replay consumption, and
counters remain atomic. Client addresses are HMACed before storage. Redis never
receives a raw client address, Turnstile response, clearance, Reactor JWT, or
API key.

Missing/invalid configuration, missing trusted client address, challenge
failure, replay, budget exhaustion, or Redis failure returns without calling
Reactor. An admitted request consumes its conservative budget slot even if
Reactor later fails; that response still sets or renews the already-admitted
clearance so the browser does not replay its Turnstile response.

Create a Turnstile widget restricted to every production hostname and create a
durable Upstash Redis database. Configure these values in Vercel:

| Variable | Visibility | Purpose |
|---|---|---|
| `VITE_TURNSTILE_SITE_KEY` | public build value | Turnstile widget site key |
| `TURNSTILE_SECRET_KEY` | server secret | Siteverify credential |
| `TURNSTILE_EXPECTED_HOSTNAMES` | server config | exact comma-separated hostnames returned by Siteverify |
| `UPSTASH_REDIS_REST_URL` | server config | durable Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | server secret | durable Redis credential |
| `SESSION_CLIENT_HASH_SECRET` | server secret | random 32+ character HMAC secret for client identifiers |
| `SESSION_CLEARANCE_HASH_SECRET` | server secret | separate random 32+ character HMAC secret for opaque clearances; rotation revokes all |
| `SESSION_CLEARANCE_TTL_SECONDS` | server config, optional | sliding clearance lifetime, 300 through 2592000 seconds; default 2592000 (30 days) |
| `SESSION_CLIENT_LIMIT` | server config | maximum admitted tokens per client window |
| `SESSION_CLIENT_WINDOW_SECONDS` | server config | fixed-window duration |
| `SESSION_GLOBAL_DAILY_LIMIT` | server config | maximum admitted tokens per UTC day |
| `REACTOR_API_KEY` | server secret | Reactor token-mint credential |
| `VITE_REACTOR_MODEL` | optional public build value | default `reactor/lingbot-world-2`; use `reactor/lingbot` for navigable fallback or `reactor/helios` for cinematic fallback |
| `SESSION_PREVIEW_BYPASS` | preview-only server config | explicitly permits the server bypass on authenticated Vercel previews |
| `VITE_SESSION_CHALLENGE_MODE` | preview-only public build value | set to `disabled` so preview clients do not request a challenge |

There are deliberately no code defaults for the three limits. Pick values from
the account's real concurrency/spend tolerance (for example, a small number of
sessions per ten-minute client window and a daily token count whose worst-case
session duration is affordable), set provider alerts below the hard limit, and
lower the global limit during incidents. Never create `VITE_*` copies
of server secrets. The production client automatically opens Turnstile on the
first explicit challenge response only.

### Clearance expiry, renewal, and revocation

- The Redis record is authoritative. Its default TTL is 2592000 seconds
  (30 days); configuration is bounded from 300 seconds through that 30-day
  maximum. The browser cookie receives the same `Max-Age`.
- Each valid, admitted clearance POST atomically resets the Redis TTL and
  reissues the same opaque cookie with a fresh `Max-Age`. A malformed,
  expired, unknown, revoked, or rate-limited credential is never extended.
  Invalid credentials receive a fresh challenge contract and an expiring
  `Set-Cookie` that removes the stale browser value.
- Revoke one known clearance by HMACing its opaque value with
  `SESSION_CLEARANCE_HASH_SECRET` and deleting the matching
  `iw:{session-broker}:clearance:<hex-hmac>` key. The broker never logs or
  stores the raw value, so operators normally revoke all clearances by scanning
  and deleting only the `iw:{session-broker}:clearance:*` namespace, or by
  rotating `SESSION_CLEARANCE_HASH_SECRET`. Secret rotation immediately makes
  every old cookie unknown; old hashed keys disappear at their existing TTL.
- Challenge replay hashes expire after ten minutes, covering Turnstile's
  five-minute token validity plus margin. A verified response is atomically
  consumed even if admission is already exhausted, so it cannot become usable
  after a rate window resets.

Local `npm run dev` remains an explicit loopback-only exception: Vite's broker
uses `REACTOR_API_KEY` directly and does not emulate Turnstile, cookies, or
Redis admission. A direct non-production broker harness over plain HTTP may set
`NODE_ENV=development` and `SESSION_CLEARANCE_COOKIE_SECURE=false`; it then
uses the unprefixed `iw_session_clearance` cookie. Production and Vercel
Preview fail configuration closed if Secure is disabled. This opt-out must
never be set in deployed environments.

Alternative controls require a code/security review before substitution:

1. An authenticated account entitlement plus the same atomic Redis budgets.
2. A museum/classroom issuer that provides signed, one-time admission grants,
   with nonce consumption and global budgets in the broker.
3. A Cloudflare Worker/Durable Object in front of Vercel that performs the
   challenge and atomic admission before forwarding to a private broker.
4. A provider-native bot attestation product only if its server token is
   cryptographically verified and paired with durable global accounting.

Origin or CORS checks alone are never an acceptable substitute: non-browser
callers can forge headers and call a public endpoint directly.

The function sends the Reactor key only in the `Reactor-API-Key` request
header, returns only the upstream `jwt` on success, marks every response
`Cache-Control: no-store`, and uses generic errors so exception/upstream text
cannot disclose server configuration. The opaque clearance is available only
to the browser cookie jar and is never exposed to JavaScript or web storage.

`revolution/.vercelignore` also excludes local environment files, generated
media, tests, build output, and the trailer workspace from source uploads. The
committed pipeline metadata remains available because runtime sound design
imports its published plan. Do not remove the `.env` or generated-media
exclusions to work around a deploy.

## Large baked assets: object store plus CDN

`revolution/public/assets/` and `revolution/public/reference/` are deliberately
ignored. Splats can approach 200 MB each, while a Vercel CLI deployment accepts
at most 100 MB of source on Hobby and 1 GB on Pro. Putting a ten-chapter media
library in every application deployment would also make rollbacks and previews
needlessly expensive.

The recommended production layout is Cloudflare R2 behind a custom asset
domain. Store each release under an immutable prefix that mirrors `public/`:

```text
releases/<release-id>/assets/audio/...
releases/<release-id>/assets/models/...
releases/<release-id>/assets/video/...
releases/<release-id>/assets/worlds/...
releases/<release-id>/reference/delaware.jpg
releases/<release-id>/reference/...
```

Use the Git commit SHA or another immutable release id. Uploads happen from a
trusted operator machine or a separate asset-publish workflow; R2 write
credentials never belong in Vercel and never use a `VITE_*` name.

The hackathon deployment currently uses Cloudflare's generated `r2.dev` origin
through the concrete, versioned rewrites in `revolution/vercel.json`. Viewers
still request stable same-origin `/assets/...` and `/reference/...` URLs from
Vercel. This is intentionally a temporary hosting choice: `r2.dev` is suitable
for modest demo traffic but does not provide the caching and traffic controls
of an R2 custom domain. Replace only the rewrite origin when a project domain
is added; keep the versioned release layout and stable application URLs.

With R2's S3-compatible credentials present only in the operator environment,
run this from `revolution/` after replacing every placeholder:

```powershell
aws s3 sync public/assets "s3://<bucket>/releases/<release-id>/assets" `
  --endpoint-url "https://<account-id>.r2.cloudflarestorage.com" `
  --cache-control "public,max-age=31536000,immutable"
aws s3 sync public/reference "s3://<bucket>/releases/<release-id>/reference" `
  --endpoint-url "https://<account-id>.r2.cloudflarestorage.com" `
  --cache-control "public,max-age=31536000,immutable"
```

Do not use `--delete` against a computed or reused release prefix. A published
release is immutable; upload a new prefix when any asset changes.

After the real CDN hostname and release id exist, add both concrete rules to
the `rewrites` array in `revolution/vercel.json`:

```json
{
  "source": "/assets/:path*",
  "destination": "https://assets.example.org/releases/<release-id>/assets/:path*"
},
{
  "source": "/reference/:path*",
  "destination": "https://assets.example.org/releases/<release-id>/reference/:path*"
}
```

Replace the example hostname and release id; do not commit placeholders to the
live configuration. Vercel checks its filesystem before rewrites, so hashed
Vite JS/CSS files in local `dist/assets/` still win. Other `/assets/...`
requests and every `/reference/...` conditioning-image request go to the same
versioned CDN release without changing scene or renderer URLs. Configure the
CDN to support byte-range requests and return correct MIME types for `.spz`,
`.glb`, `.mp3`, `.mp4`, `.jpg`, and `.png`. Because release prefixes are
immutable, they can use a one-year immutable cache policy. Roll back by pointing
the rewrite at the previous complete release; never overwrite a published
release prefix.

Before changing the rewrites, compare the uploaded object inventory with both
local trees, request at least one object from every media class, fetch the exact
conditioning URL in each Participant manifest (including
`/reference/delaware.jpg`), and confirm a byte-range request returns `206`.
Deploy the app only after the complete release is readable.

## Account-dependent hosting choices

The CDN hostname cannot be selected safely in source control before an account
and domain exist. Choose one of these concrete paths:

1. **Cloudflare R2 + custom domain (recommended).** Handles 200 MB splats
   comfortably, supports immutable release prefixes, and keeps media outside
   app deploys. Remaining work: create the bucket, attach a production custom
   domain, upload `public/assets/` and `public/reference/` under one release
   prefix, set MIME/cache/range behavior, add both concrete Vercel rewrites,
   then run the public checks above.
2. **Amazon S3 + CloudFront.** Mature lifecycle, logging, and access controls,
   but more policy and invalidation setup. Remaining work: create a private
   bucket and CloudFront distribution with origin access control, upload both
   versioned trees, attach TLS/DNS, add both rewrites, and verify references and
   range requests.
3. **Vercel Blob.** Keeps billing and observability with one provider, but needs
   an upload/mapping step from stable `/assets/...` and `/reference/...` paths
   to Blob URLs and must be evaluated against the final library's delivery
   cost. Remaining work: create the store, upload the release, establish stable
   custom-domain or rewrite mappings, add them, and run the same checks.

No public URL, token mint, WebRTC stream, browser/device result, or launch
readiness should be claimed until the corresponding external steps have been
performed and observed.

## Local verification

From `revolution/`:

```powershell
npm ci
npm run test:server
npm run test:ci
npm run typecheck
npm run build
```

The GitHub Actions workflow runs the same broker test, typecheck, and build on
every pull request, including any accidental PR targeting `main`.
