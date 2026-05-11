# Carnet de temps

Tracker hebdomadaire perso (lun–ven) — projets, entrées horaires, totaux.
Données stockées en `localStorage` du navigateur.

## Lancer

```bash
npm install
npm run dev
```

Ouvre http://localhost:5173/

## Build

```bash
npm run build
npm run preview
```

## Déploiement GitHub Pages

Le workflow `.github/workflows/deploy.yml` build et déploie automatiquement à chaque push sur `master` (ou `main`).

**Setup en une fois** (sur GitHub) :
1. Va dans **Settings → Pages**
2. Sous *Source*, choisis **GitHub Actions**

Une fois en place, le site est dispo à : https://warshoow.github.io/time-tracker/

Si tu renommes le repo, change la ligne `base` dans `vite.config.js`.

## Stack

- Vite + React 18
- lucide-react (icônes)
- Persistance via `localStorage` (clé `tt:state:v1`)
