# BIVA — Business Inventory & Value Assistant

Inventory and point-of-sale for small businesses in Sierra Leone. Works online and offline after sign-in (installable PWA).

## Requirements

- Node.js 20+
- PostgreSQL database ([Neon](https://neon.tech) recommended)
- Roarbyte auth API (`API_URL` / `NEXT_PUBLIC_API_URL`) for login OTP

## Local setup

1. Copy environment variables (create `.env` from your team template).

2. Set `DATABASE_URL`, `JWT_SECRET`, and auth provider keys in `.env`.

3. Install dependencies and apply migrations:

```bash
pnpm install
pnpm exec prisma migrate deploy
```

4. Start the dev server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production deploy (Render + Neon)

### 1. Neon (database)

1. Create a project at [neon.tech](https://neon.tech).
2. Copy the **connection string** → use as `DATABASE_URL` on Render.
3. Wake the database before the first deploy if the free tier was sleeping.

### 2. Render (web app)

1. [Render](https://render.com) → **New → Web Service** → connect your Git repo.
2. **Runtime:** Node  
3. **Build command:** `node scripts/vercel-build.mjs`  
4. **Start command:** `pnpm start` (or `npm start`)  
5. **Environment variables** (same as below): at minimum `DATABASE_URL`, `JWT_SECRET`, `API_URL`, `NEXT_PUBLIC_API_URL`, and optional `APP_NAME=BIVA`.

The build script runs `prisma generate`, `prisma migrate deploy`, then `next build`.

### 3. After deploy (each shop device)

1. Open the live URL **while online** and sign in.
2. Visit **Sell**, **Products**, and **History** once (offline cache).
3. After a major update, clear site data or unregister the old service worker once.

### Vercel (alternative)

`vercel.json` uses the same build command. Set the same env vars under **Project → Environment Variables**.

### Required environment variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (Neon) |
| `JWT_SECRET` | Session signing (long random string, 32+ chars) |
| `APP_NAME` | Optional override; default display name is **BIVA** |

### Roarbyte login API

| Variable | Purpose |
|----------|---------|
| `API_URL` | Full Login URL, e.g. `https://host/api/Login` |
| `NEXT_PUBLIC_API_URL` | Same URL for the browser |

Login requires **SuperAdmin** role, an **active subscription**, and module id `22222222-2222-2222-2222-222222222203` (Lite Inventory System). Inventory rows are scoped by `tenant_id` from the login token.

### Operator console (developer only)

Not part of the shop UI.

1. Add operator email(s): `ADMIN_EMAILS="you@example.com"`
2. Sign in to BIVA (same OTP login as shops).
3. Open **`/admin`** in the browser.

### Privacy

Set `PRIVACY_CONTACT_EMAIL` for `/privacy`.

## Offline & install

- Sign in **once while online** (OTP). Session stays on device.
- Dashboard data caches locally; sales and product edits queue when offline.
- Install prompt on the dashboard (HTTPS in production).
- Service worker is disabled in `pnpm dev` to avoid stale cache.

## Troubleshooting production

1. **Clear site data** for your app URL (old service worker): DevTools → Application → Service Workers → Unregister → Clear storage.
2. Confirm deploy **succeeded**; build logs must not show `DATABASE_URL is missing` or `migrate deploy failed`.
3. Wake **Neon** before redeploying if migrations fail.
4. **Offline on live URL:** sign in online, open Sell/Products/History, then test offline. After rebrand deploy, service worker **v8** uses new cache names — clear old site data once.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Development server |
| `pnpm run build` | Generate Prisma client + production build |
| `pnpm start` | Run production server |
| `pnpm run db:migrate:deploy` | Apply production migrations |
| `pnpm run typecheck` | TypeScript check |

Shop docs (validation, SOP, training): see [`docs/README.md`](docs/README.md).
