# AGENTS.md

This repository contains a legacy SR support tool deployed to Cloudflare Workers/OpenNext.

## Absolute safety rules

- Do not modify `public/index.html` unless the task explicitly says an exact element/link inside it must change.
- Do not modify `public/app.js` unless the task explicitly says the core SR logic must change.
- Do not refactor, reformat, sort, rename, or "clean up" legacy HTML, SR links, SR data, menu order, tab order, or UI structure.
- Do not change SR Sales, SR Technical, Mobile, FTTH, Fixed Voice, Calculate, or any SR menu behavior unless the task names that exact area.
- Do not change theme behavior, logo position, header layout, element sizes, or visual ordering unless the task explicitly asks for that exact visual change.
- Do not edit `wrangler.jsonc`, `next.config.js`, or `package.json` unless the task is explicitly about deployment/build configuration.
- Never delete files unless you prove they are unused backups/temp/archive artifacts and mention the evidence in the final summary.

## Preferred safe edit locations

Use these files first for additive fixes:

- `public/safe-customization-layer.css`
- `public/safe-customization-layer.js`
- `public/safe-tool-upgrade.css`
- `public/safe-tool-upgrade.js`
- `public/non-critical-loader.js`

When possible, scope CSS to exact IDs, for example:

```css
body #SR\ Sales #dddiv { ... }
```

## Cloudflare consumption rules

- Keep static files asset-first. Do not expand `assets.run_worker_first` unless the route truly needs auth/API middleware.
- Avoid adding startup polling, repeated `fetch()` loops, or broad `setInterval()` loops.
- Prefer Supabase Realtime or user-triggered loading over repeated API polling.
- Cache static assets through `public/_headers` rather than adding Worker logic.
- Keep private/internal URLs out of search indexing using `robots.txt` / `X-Robots-Tag`.

## Validation checklist

After any code change, run the relevant lightweight checks:

```bash
node --check public/non-critical-loader.js
node --check public/admin-message-client.js
node --check public/support-chat.js
node --check public/admin.js
```

Before finishing, report:

1. Files changed.
2. Why each file changed.
3. Confirmation that `public/index.html` and `public/app.js` were not changed, unless explicitly requested.
4. Any behavior that could be affected.
