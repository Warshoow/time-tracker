# Changelog

Récap des fonctionnalités livrées depuis l'init du projet, groupées par thème.

---

## Bootstrap

- Stack : Vite + React 18 + lucide-react
- Structure standard `src/`, `src/main.jsx` entry, `src/TimeTracker.jsx` composant principal
- Remplacement de `window.storage` (API Claude artifacts) par `localStorage` synchrone, clé `tt:state:v1`
- Nettoyage imports inutilisés, `.gitignore`, `README.md`

## UX du calendrier

- **Layout adaptatif des entrées** selon leur durée :
  - `compact` (≤ 15 min) : 1 ligne `Project · Title` centrée verticalement
  - `inline` (16–59 min) : L1 `Project · Title` + L2 `HH:MM–HH:MM`
  - `full` (≥ 60 min) : L1 Project / L2 Title / L3 plage horaire
- **Redimensionnement au drag** des poignées haut/bas de chaque bloc, snap 15 min, clamp aux bornes de la journée et largeur min 15 min
- **Ligne d'aide au survol** : ligne pointillée terracotta + badge `HH:MM` qui suit la souris snappée aux 15 min. Cachée pendant un resize et quand le modal est ouvert
- **Sidebar sticky** : `position: sticky` pour qu'elle reste collée au viewport quand la page scrolle (utile quand le récap pousse la hauteur totale)

## Saisie

- **Clic droit sur le calendrier** → ouvre le modal d'ajout pré-rempli avec l'heure cliquée snappée à 15 min
- **Modal d'ajout repensé** : heure de début affichée en gros (non éditable, vient du clic), sélecteur `Durée` (15min → 4h) qui calcule l'heure de fin automatiquement. Plus de double `TimePicker` Début/Fin
- **TimePicker custom** (`<select>` avec créneaux pré-générés) pour remplacer les `<input type="time">` natifs (spinners Windows pénibles). Step 15 min pour les entrées, 30 min pour les bornes de journée
- Validation : `end > start`, alerte si projet manquant

## Stats / récap

- **Total semaine** dans la sidebar, mis à jour en live
- **Récap projet × jour** sous le calendrier : tableau projet × 5 jours + totaux ligne/colonne, tri par total décroissant. Caché quand aucune entrée

## Déploiement

- **GitHub Pages** configuré via `.github/workflows/deploy.yml` (build + publish auto sur push `master`/`main`)
- `vite.config.js` : `base: '/time-tracker/'` en build, `/` en dev (pour ne pas casser `npm run dev`)
- Instructions setup dans `README.md` (activer Pages → Source: GitHub Actions une seule fois)

## Refactor structure

- Split du monolithe `TimeTracker.jsx` (1979 lignes) en **17 fichiers** :
  - `lib/date.js`, `lib/storage.js`, `lib/constants.js`, `lib/jira.js`
  - `styles.css` extrait du `<style>` inline JSX
  - `components/` : `TimePicker`, `Sidebar`, `Calendar`, `DayColumn`, `EntryBlock`, `HoverGuide`, `RecapPanel`
  - `components/modals/` : `SettingsModal`, `ProjectModal`, `AddEntryModal`
- État centralisé dans le root (`TimeTracker.jsx`, ~480 lignes), composants enfants en mode "dumb" (props + callbacks)
- Pas de Context : prop drilling assumé à cette échelle
- Helpers de couleur projet dupliqués localement dans chaque consommateur plutôt que de passer des fonctions en props
- Behavior strictement préservé (no-op fonctionnel)

## Jira — Phase 2 (push réel via proxy serverless)

- **Proxy** dans [`proxy/`](proxy/) — Express + Docker, prêt pour Dokploy
  - `POST /api/jira-worklog` → forward vers `/rest/api/3/issue/{key}/worklog`
  - `GET /healthz` pour Dokploy healthcheck
  - ADF (Atlassian Document Format) géré pour le comment
  - CORS multi-origines via env `ALLOWED_ORIGIN`
  - Validation stricte des inputs
- **Frontend** :
  - `lib/jira.js` : helper `pushEntryToJira` (fetch vers proxy + parsing) et `getPushableEntries` (filtre)
  - Settings : champ "URL du proxy" (token jamais côté client)
  - Bouton **"Pousser N sur Jira"** dans le header du RecapPanel — affiche progression `done/total`
  - Push séquentiel (safe vs rate limit), confirmation avant, alerte de résumé après
  - `entry.syncedAt` posé au succès → badge devient `[KEY ✓]` avec opacité réduite
- **Setup restant côté user** : créer token Atlassian, déployer proxy via Dokploy ([`proxy/README.md`](proxy/README.md)), coller l'URL dans Réglages

## Jira — Phase 1 (UI + schéma, sans push réel)

- **Toggle global** dans Réglages : quand OFF, aucun élément Jira n'apparaît
- **URL Jira Cloud** saisie dans Réglages (utilisée en Phase 2)
- **Schéma** :
  - `settings.jira = { enabled, baseUrl }`
  - `project.jiraKey?` (issue par défaut)
  - `entry.jiraKey?` (override, stocké seulement si ≠ défaut projet)
  - `entry.syncedAt?` réservé pour Phase 2
- **Modal projet refactoré** : mode create + edit. Clic sur le nom dans la sidebar → édition. Champ "Issue Jira par défaut" si Jira activé
- **Modal d'ajout** : champ "Issue Jira" auto-pré-rempli avec le défaut du projet, se met à jour si on change de projet
- **Badges visuels** `[KEY]` discrets sur les blocs d'entrée du calendrier et dans la liste sidebar
- **Migration douce** : merge à la lecture du localStorage pour que les anciennes data récupèrent les défauts sans casser
- **Helper** `effectiveJiraKey(entry)` (override entry → défaut projet → ""), réutilisable en Phase 2

## Docs parking (idées explorées, pas codées)

- [`docs/sync-and-embed.md`](docs/sync-and-embed.md) : embed Notion (faisable, piège localStorage par origin), comparaison Notion DB vs Supabase comme backend de sync
- [`docs/jira-integration.md`](docs/jira-integration.md) : spec complète Jira (worklog API, proxy serverless, schéma, UX batch push). Phase 1 marquée livrée, prérequis Phase 2 listés
