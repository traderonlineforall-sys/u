# SR Tool (Vercel Free) - Protected

This version wraps your existing static tool (public/index.html) inside a Next.js project and adds **HTTP Basic Auth** using **Next.js Middleware** so the site does not load for unauthorized users.

## What changed
- Added `middleware.js` to require Basic Auth on all paths (except Next internal assets).
- Copied your original tool into `public/` unchanged.
- Added Next.js `app/` with a redirect to `/index.html`.
- Added `next.config.js` rewrite: `/` -> `/index.html`.

## How to deploy on Vercel
1) Create a new Vercel Project and import this folder (or drag/drop).
2) In Vercel dashboard: **Settings -> Environment Variables**
   - `BASIC_AUTH_USER` = your username
   - `BASIC_AUTH_PASS` = your password
   Set them for Production (and Preview if you want).
3) Deploy.

## How it behaves
- When anyone opens the site, the browser shows a Basic Auth login prompt.
- Only correct username/password can access **everything**, including the static HTML/CSS/JS.
- If env vars are missing in Production, the site returns 503 (fails closed).

## Local run
```bash
npm install
npm run dev
```

> Tip: create a `.env.local` file during local development with BASIC_AUTH_USER / BASIC_AUTH_PASS.


## Build note
This package includes TypeScript devDependencies to satisfy Next.js type-check step on Vercel.


## V5 – Professional Login UI (session cookie)

- Visit `/login` for a branded login page.
- Set `BASIC_AUTH_USER` and `BASIC_AUTH_PASS` (credentials), and optionally `SESSION_SECRET` (signing key). If `SESSION_SECRET` is not set, the app falls back to `BASIC_AUTH_PASS`.
- After login, you are redirected to `/index.html`.
- Logout: open `/logout`.
