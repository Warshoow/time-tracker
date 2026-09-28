# Time tracker

A personal weekly time tracker (Monday to Friday): projects, time entries,
totals. Data is stored in the browser's `localStorage`.

Live at https://warshoow.github.io/time-tracker/

## Run

```bash
npm install
npm run dev
```

Opens on http://localhost:5173/

## Build

```bash
npm run build
npm run preview
```

## Deploying to GitHub Pages

The `.github/workflows/deploy.yml` workflow builds and deploys on every push to
`master` (or `main`).

One-time setup on GitHub: **Settings → Pages**, and under *Source* pick
**GitHub Actions**.

If you rename the repo, change the `base` line in `vite.config.js`.

## Stack

- Vite + React 18
- lucide-react (icons)
- Persistence through `localStorage` (key `tt:state:v1`)
