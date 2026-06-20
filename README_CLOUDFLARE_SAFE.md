# Cloudflare-safe deployment notes

This copy keeps the existing SR UI and core files intact, and only changes the minimum server/config files needed for safer Cloudflare deployment.

## Core files deliberately not changed

- `public/app.js`
- `public/index.html`
- `public/styles.css`

## What changed

1. Added Cloudflare OpenNext configuration:
   - `wrangler.jsonc`
   - `open-next.config.ts`
   - `package.json` scripts: `preview`, `deploy`, `cf-typegen`

2. Made session signing compatible with Cloudflare Middleware/Workers:
   - `lib/session.js` no longer depends on Node `Buffer`.

3. Reduced middleware/worker pressure:
   - `middleware.js` still protects HTML pages and API routes.
   - Static assets like JS/CSS/fonts/images no longer run through middleware.
   - This reduces request cost heavily compared with protecting every asset request.

4. Fixed safe existing route issues:
   - `app/api/logout/route.js` now receives `request` correctly.
   - `app/api/admin-bulk-delete/route.js` now supports the `ids` payload already used by `public/admin.js`, with a 500-id safety cap.

## Cloudflare environment variables

Set these as Cloudflare Worker/Build variables/secrets:

- `BASIC_AUTH_USER`
- `BASIC_AUTH_PASS`
- `SESSION_SECRET` recommended, can be any strong random string
- `ADMIN_PASSWORD`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- Optional: `ALLOWLIST_IPS`

The public Supabase anon key remains in `public/supabase-config.js` as before.

## Commands

```bash
npm install
npm run preview
npm run deploy
```

## Important security note

To reduce worker requests, static files such as `.js`, `.css`, fonts, and images are not passed through middleware. The actual HTML pages and API routes remain protected. If you need every static file to be private too, put the final domain behind Cloudflare Access, or restore full middleware coverage knowing it will increase request usage.
