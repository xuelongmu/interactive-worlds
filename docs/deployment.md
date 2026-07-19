# Production deployment

The production shape is a Vite static deployment on Vercel, one Node function
at `POST /api/session`, and a separate object-store/CDN origin for baked media.
The Reactor key exists only in the Vercel function environment. Pipeline keys
and object-store write credentials are never needed by the browser or build.

## Deploy the static app and session broker

1. Import this repository into Vercel and set **Root Directory** to
   `revolution` (or run `npx vercel --cwd revolution` from a fresh clone).
2. Keep the build settings from `revolution/vercel.json`: `npm run build` and
   output directory `dist`.
3. In Project Settings > Environment Variables, add `REACTOR_API_KEY` to the
   Production environment. Add it to Preview only when live paid sessions from
   preview deployments are intentional. Never create a `VITE_REACTOR_*`
   variable: Vite exposes `VITE_*` values to client bundles.
4. Deploy. Verify that `GET /api/session` returns `405` and that
   `POST /api/session` returns JSON containing a short-lived `jwt`.
5. Open `/`, `/spikes/splat/`, and `/spikes/worldmodel/`. In the world-model
   spike, connect, wait for moving video, and verify WASD/arrows affect the
   stream before disconnecting. A token response alone does not prove WebRTC.

The function sends the server key only in the `Reactor-API-Key` request header,
marks every response `Cache-Control: no-store`, and returns a generic `502`
for network failures so exception text cannot disclose server configuration.

`revolution/.vercelignore` also excludes local environment files, offline
pipeline code, generated media, tests, and build output from CLI source uploads.
Do not remove the `.env` or generated-media exclusions to work around a deploy.

## Large baked assets: object store plus CDN

`revolution/public/assets/` is deliberately ignored. Splats can approach
200 MB each, while a Vercel CLI deployment accepts at most 100 MB of source on
Hobby and 1 GB on Pro. Putting a ten-chapter media library in every application
deployment would also make rollbacks and previews needlessly expensive.

The recommended production layout is Cloudflare R2 behind a custom asset
domain. Store each release under an immutable prefix that mirrors `public/`:

```text
releases/<release-id>/assets/audio/...
releases/<release-id>/assets/models/...
releases/<release-id>/assets/video/...
releases/<release-id>/assets/worlds/...
```

Use the Git commit SHA or another immutable release id. Uploads happen from a
trusted operator machine or a separate asset-publish workflow; R2 write
credentials never belong in Vercel and never use a `VITE_*` name.

With R2's S3-compatible credentials present only in the operator environment,
run this from `revolution/` after replacing every placeholder:

```powershell
aws s3 sync public/assets "s3://<bucket>/releases/<release-id>/assets" `
  --endpoint-url "https://<account-id>.r2.cloudflarestorage.com" `
  --cache-control "public,max-age=31536000,immutable"
```

Do not use `--delete` against a computed or reused release prefix. A published
release is immutable; upload a new prefix when any asset changes.

After the real CDN hostname and release id exist, add this concrete rule to
the `rewrites` array in `revolution/vercel.json`:

```json
{
  "source": "/assets/:path*",
  "destination": "https://assets.example.org/releases/<release-id>/assets/:path*"
}
```

Replace the example hostname and release id; do not commit placeholders to the
live configuration. Vercel checks its filesystem before rewrites, so hashed
Vite JS/CSS files in local `dist/assets/` still win. Other `/assets/...`
requests go to the versioned CDN release without changing scene or renderer
URLs. Configure the CDN to support byte-range requests and return correct MIME
types for `.spz`, `.glb`, `.mp3`, and `.mp4`. Because release prefixes are
immutable, they can use a one-year immutable cache policy. Roll back by pointing
the rewrite at the previous complete release; never overwrite a published
release prefix.

Before changing the rewrite, compare the uploaded object inventory with the
local `public/assets/` tree, request at least one object from every media class,
and confirm a byte-range request returns `206`. Deploy the app only after the
complete release is readable.

## Account-dependent hosting choices

The CDN hostname cannot be selected safely in source control before an account
and domain exist. Choose one of these concrete paths:

1. **Cloudflare R2 + custom domain (recommended).** Handles 200 MB splats
   comfortably, supports immutable release prefixes, and keeps media outside
   app deploys. Remaining work: create the bucket, attach a production custom
   domain, upload `public/assets/` under a release prefix, set MIME/cache/range
   behavior, add the concrete Vercel rewrite, then run the public checks above.
2. **Amazon S3 + CloudFront.** Mature lifecycle, logging, and access controls,
   but more policy and invalidation setup. Remaining work: create a private
   bucket and CloudFront distribution with origin access control, upload the
   versioned tree, attach TLS/DNS, add the rewrite, and verify range requests.
3. **Vercel Blob.** Keeps billing and observability with one provider, but needs
   an upload/mapping step from stable `/assets/...` paths to Blob URLs and must
   be evaluated against the final library's delivery cost. Remaining work:
   create the store, upload the release, establish a stable custom-domain or
   rewrite mapping, add that mapping, and run the same inventory/range checks.
4. **Vercel static files on Pro for an early milestone only.** Simplest routing,
   but the entire library rides each deployment and the 1 GB CLI source ceiling
   may be exceeded as chapters accumulate. Remaining work: confirm the complete
   generated tree stays within the active plan limits, explicitly include it in
   the deployment upload without committing it, deploy, and repeat after every
   asset change. This is not the recommended ten-chapter launch path.

No public URL, token mint, WebRTC stream, browser/device result, or launch
readiness should be claimed until the corresponding external steps have been
performed and observed.

## Local verification

From `revolution/`:

```powershell
npm ci
npm run test:server
npm run typecheck
npm run build
```

The GitHub Actions workflow runs the same broker test, typecheck, and build on
pull requests targeting `revolution-scaffold`.
