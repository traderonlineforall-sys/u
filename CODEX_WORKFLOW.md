# Codex Workflow for This SR Tool

Use this as the default process for future Codex tasks.

## 1. Start in Ask Mode for risky tasks

For layout, SR logic, Cloudflare routing, or admin/chat changes, first ask Codex for an audit/plan only. Switch to Code Mode only after the plan is acceptable.

## 2. Use narrow tasks

Good task shape:

```text
Goal:
Fix [exact issue] in [exact tab/feature].

Scope:
Allowed files:
- public/safe-customization-layer.css
- public/safe-customization-layer.js

Forbidden:
- public/index.html
- public/app.js
- SR data
- menu structure
- tab order
- theme/logo/header positioning

Validation:
- Open [specific tab]
- Confirm [specific visual/behavior]
- Run node --check on changed JS files
```

## 3. Keep diffs minimal

Do not let Codex do broad cleanup. This project has legacy HTML and CSS that may look messy but is part of the working UI.

## 4. Cloudflare-safe defaults

- Do not add polling.
- Do not add new API startup calls.
- Prefer lazy loading and browser/static cache.
- Do not make all static assets pass through Worker.
- Keep `_headers` and `robots.txt` intact.

## 5. Final answer expected from Codex

Codex should always summarize:

- Changed files.
- Exact reason for each change.
- Tests/checks run.
- Confirmation that SR data/menu structure/core UI were not touched.
