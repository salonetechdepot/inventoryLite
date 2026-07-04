# StockEasy — Simple Inventory

Inventory and point-of-sale for small businesses in Sierra Leone. Works online and offline after sign-in (installable PWA).

## Requirements

- Node.js 20+
- PostgreSQL database
- Roarbyte auth API (`API_URL` / `NEXT_PUBLIC_API_URL`) for login OTP

## Local setup

1. Copy environment variables:

```bash
cp .env.example .env
```

2. Set `DATABASE_URL`, `JWT_SECRET`, and auth provider keys in `.env`.

3. Install dependencies and apply migrations:

```bash
npm install
npx prisma migrate deploy
```

4. Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production deploy

Run database migrations as a separate release step before building:

```bash
npm run db:migrate:deploy
npm run build
npm start
```

On Vercel or similar hosts, set the same env vars as in `.env.example`. The `build` script runs:

1. `prisma generate`
2. `next build`

Ensure `DATABASE_URL` is available to the migration step. Do not apply migrations from a public build command.

### Required environment variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Session signing (long random string) |
| `APP_NAME` | Shown in emails and legal pages |

### Roarbyte login API

| Variable | Purpose |
|----------|---------|
| `API_URL` | Full Login URL, e.g. `https://host/api/Login` |
| `NEXT_PUBLIC_API_URL` | Same URL for the browser (axios + zustand) |

Login requires **SuperAdmin** role, an **active subscription**, and module id `22222222-2222-2222-2222-222222222203` (Lite Inventory System). Inventory rows are scoped by `tenant_id` from the login token.

### Operator console (developer only)

This is **not** part of the shop app UI. Shop owners never see it.

1. Add your operator email(s) to `.env`:
   ```env
   ADMIN_EMAILS="you@example.com"
   ```
2. Sign in to StockEasy normally (same OTP login as shops).
3. Open **`/admin`** directly in the browser (bookmark it).

From there you can view platform stats, search all registered shops, inspect each account’s usage, and **permanently delete** a user plus all their data. Operator accounts listed in `ADMIN_EMAILS` cannot be deleted from the console.

### Privacy

Set `PRIVACY_CONTACT_EMAIL` for the public privacy policy page at `/privacy`.

## Offline & install

- Sign in **once while online** (OTP). Session stays on device.
- Dashboard data caches locally; sales and product edits queue when offline.
- Install prompt appears on the dashboard (production HTTPS).
- Service worker is disabled in `npm run dev` to avoid stale cache issues.

## Troubleshooting production (ERR_FAILED / blank page)

If the site works in one browser but Edge shows **“can't reach this page” / ERR_FAILED**:

1. **Clear site data** for the Vercel URL (old service worker cache):
   - Edge → Settings → Cookies and site permissions → See all cookies and site data → search `vercel.app` → Remove
   - Or DevTools (F12) → Application → Service Workers → Unregister → Clear storage
2. Try **InPrivate** window (extensions off).
3. Confirm **Vercel deployment succeeded** (Dashboard → Deployments → latest = Ready).
4. In Vercel **Project → Settings → Environment Variables**, set `DATABASE_URL`, `JWT_SECRET`, and auth keys for **Production**.
5. Wake **Neon** database (free tier sleeps) before redeploying.

The app registers a service worker in production only; a broken cached worker can block loads until site data is cleared.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Generate Prisma client + production build |
| `npm start` | Run production server |
| `npm run db:migrate:deploy` | Apply production migrations |
| `npm run db:migrate:status` | Check migration status |
| `npx prisma studio` | Browse database |
