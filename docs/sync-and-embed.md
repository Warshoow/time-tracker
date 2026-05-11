# Sync & embed — notes à explorer plus tard

État actuel : données en `localStorage` (clé `tt:state:v1`), pas de sync, pas d'embed configuré.

---

## 1. Embed dans Notion

### Faisabilité
Le projet est une SPA Vite → `npm run build` sort un `dist/` statique. Notion accepte n'importe quelle URL avec `/embed`. Aucun changement de code requis si on garde `localStorage`.

### Chemin le plus court
1. Push le repo sur GitHub
2. Connecter à **Vercel** ou **Netlify** (gratuit, ~2 min, redeploy auto)
3. Récupérer l'URL `https://xxx.vercel.app`
4. Dans Notion : `/embed`, coller l'URL

### À configurer si on déploie en sous-chemin (GitHub Pages)
```js
// vite.config.js
export default defineConfig({
  base: '/time-tracker/',  // nom du repo
  ...
});
```

### Piège localStorage en iframe
- **Chrome/Edge** (par défaut) : l'iframe Notion et l'onglet standalone partagent le même `localStorage` → mêmes données partout ✓
- **Safari / Firefox strict** : storage partitionné par site parent → l'embed Notion aurait un stockage séparé du standalone
- Donc OK pour usage solo sur Chrome, à creuser si autre cas

### Option : mode `?embed=1`
Cacher la sidebar et compacter le layout quand l'URL contient `?embed=1`, pour s'adapter aux colonnes étroites de Notion. ~15 lignes de code à rajouter.

---

## 2. Backend : Notion DB vs Supabase

Pour passer du `localStorage` à du vrai sync multi-appareils.

### Notion DB comme backend

**Architecture obligatoire** :
- Pas d'appel direct depuis le navigateur (CORS bloqué côté Notion)
- Token API exposé si dans le code client → quiconque visite la page peut lire/écrire/supprimer
- **Solution : petite fonction serverless** (Vercel Functions / Netlify Functions / Cloudflare Workers) qui fait proxy. Token côté serveur uniquement. ~50 lignes.

**Schéma Notion** :
- Une DB "Entrées" avec propriétés : Date, Projet (relation ou select), Début (text "HH:MM"), Fin (text "HH:MM"), Titre
- Optionnel : une DB "Projets" séparée pour gérer la liste

**Limites** :
- Rate limit officiel : **3 req/sec en moyenne** → si on resize 5 entrées au drag rapide, throttle
- Latence : **200–500ms par appel** → drag avec sauvegarde live = laggy
- Mitigation : cache `localStorage` en miroir + débounce/batch sur les writes

**Avantage gros** : les données sont visibles/éditables nativement dans Notion (filtre, vue, exports…).

### Supabase comme backend

**Architecture** :
- Postgres managé + lib JS officielle (`@supabase/supabase-js`)
- Auth intégrée (magic link, OAuth Google/etc) — ou clé anonyme pour usage solo
- Pas de proxy nécessaire, RLS (row-level security) gère l'accès

**Schéma** :
```sql
create table projects (id uuid primary key, name text, created_at timestamptz);
create table entries (
  id uuid primary key,
  project_id uuid references projects,
  date date,
  start_min int,  -- minutes depuis minuit, plus simple que HH:MM
  end_min int,
  title text,
  created_at timestamptz
);
```

**Setup estimé** : ~30 min.

### Comparaison

| Critère | Notion DB | Supabase |
|---|---|---|
| Setup initial | 1–2h (proxy + token + schéma) | ~30 min |
| Latence | 200–500ms | <50ms |
| Rate limit | 3 req/s (strict) | Très large (gratuit) |
| Données visibles dans Notion | ✓ | ✗ |
| Multi-appareils | ✓ | ✓ |
| Coût | Gratuit | Gratuit jusqu'à 500MB |
| Complexité maintenance | + (proxy à maintenir) | – |

---

## Décision à prendre

Dépend de l'usage cible :
- **"Je veux voir/éditer mes entrées dans Notion comme une DB native"** → Notion DB, avec proxy serverless. La complexité vaut le coup uniquement si ce browse natif est important.
- **"Je veux juste que ça sync entre PC perso/boulot/téléphone"** → **Supabase**. Plus simple, plus rapide, plus robuste.

À court terme : rester en `localStorage` + embed Notion (qui fonctionne en Chrome) est largement suffisant pour un usage solo sur un seul poste.
