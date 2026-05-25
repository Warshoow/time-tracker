# Intégration Jira

**Phase 1 et Phase 2 livrées.** Setup à finaliser côté Dokploy + saisie de l'URL proxy dans les Réglages.

Cible : Jira **Cloud** (`*.atlassian.net`, API v3, auth par email + API token).
Hosting proxy : **VPS perso via Dokploy** (Docker + TLS auto via Let's Encrypt).

## Phase 1 — livrée ✓

- **Toggle** dans Réglages → quand OFF, aucune UI Jira n'apparaît nulle part (mode perso pur)
- **URL Jira Cloud** saisie dans Réglages (capturée maintenant, utilisée en Phase 2)
- **Schéma étendu** :
  - `settings.jira = { enabled: bool, baseUrl: string }`
  - `project.jiraKey?: string` — issue par défaut pour ce projet
  - `entry.jiraKey?: string` — override par entrée (stocké uniquement si différent du défaut projet)
  - `entry.syncedAt?: string` — prévu mais pas encore utilisé (Phase 2)
- **UI** :
  - Modal projet refait en mode create + edit (clic sur le nom dans la sidebar → édition)
  - Champ "Issue Jira par défaut" dans modal projet (si Jira activé)
  - Champ "Issue Jira" dans modal d'ajout d'entrée, pré-rempli avec le défaut du projet
  - Badge `[KEY]` discret sur les blocs d'entrée et dans la liste des projets sidebar
  - Le select Projet du modal d'ajout affiche la clé Jira inline (ex. `API · API-42`)
- **Migration** : les anciennes data localStorage sont mergées avec les nouveaux défauts (rien ne casse)

État actuel : workflow manuel. Track le temps dans l'app, puis ressaisi dans Jira ticket par ticket. Pénible.

Objectif Phase 2 : pousser les entrées du tracker directement comme worklogs Jira.

---

## Faisabilité technique

Jira expose une API worklog officielle :
```
POST /rest/api/3/issue/{issueIdOrKey}/worklog
{
  "timeSpentSeconds": 3600,
  "started": "2026-05-18T09:30:00.000+0200",
  "comment": "revue PR"
}
```

Ça apparaît dans la timeline Jira comme une saisie manuelle classique. Marche sur Cloud (`api/3`) et Server/Data Center (`api/2`, endpoints légèrement différents).

---

## Contraintes (mêmes que Notion DB, voir [sync-and-embed.md](./sync-and-embed.md))

### 1. CORS bloqué côté Jira
L'API Atlassian rejette les requêtes browser cross-origin. Impossible d'appeler depuis la SPA directement.
→ **Petit proxy serverless obligatoire** (Vercel/Cloudflare Function, ~30 lignes).

### 2. Sécurité du token
Token API Atlassian = full access aux issues/worklogs du user. Jamais dans le code client.
→ Stocké en variable d'env de la fonction serverless. Le client appelle `/api/jira-worklog` sans connaître le token.

### 3. Politique d'entreprise
À vérifier avant de s'engager :
- Est-ce que je peux créer un API token sur `id.atlassian.com/manage-profile/security/api-tokens` ? Certaines boîtes le bloquent via SSO.
- Y a-t-il un firewall qui filtre l'accès API depuis l'extérieur ?
- Politique data : pousser via un tiers (Vercel/Cloudflare héberge le proxy) peut être un blocker légal selon la sensibilité des comments.

---

## Changements à faire dans l'app

### Schéma
Le concept "Projet" actuel est trop large. Au boulot le temps se trace contre des **tickets**, pas des projets.

Deux options :

**A. Issue key par entrée**
- Champ `jiraKey` (optionnel) sur chaque entry
- Plus flexible mais demande de saisir le ticket à chaque ajout

**B. Issue key par projet (par défaut)**
- Chaque "Projet" du tracker mappe à une issue Jira par défaut
- Tu crées un projet "Revue PR API" rattaché à `API-42` → toutes ses entrées poussent là
- Plus rapide à l'usage, moins flexible (1 projet = 1 ticket)

**C. Hybride** (probablement le bon)
- Issue key par défaut au niveau projet (option B)
- Override possible par entrée si une session précise concerne un autre ticket
- Le modal d'ajout pré-remplit avec le défaut du projet, modifiable

### Flag de sync
Ajouter `syncedAt: string | null` sur chaque entry. Évite les doublons si on relance le push.

### UX : batch push hebdomadaire
Bouton **"Pousser la semaine sur Jira"** en bas du calendrier :
- Liste les entries non synchronisées de la semaine, groupées par issue key
- Un clic → push séquentiel (respect du rate limit), affichage live : `✓ pushed` / `✗ failed` / `– skipped`
- Au succès : `syncedAt = now()`, l'entry est marquée visuellement (badge discret) dans le calendrier
- Les entries déjà sync peuvent être re-pushées explicitement si on les a modifiées (option dans le menu)

---

## Architecture serverless

```
Browser (SPA)
    │
    │  POST /api/jira-worklog
    │  { issueKey, startedISO, durationSec, comment }
    │
    ▼
Vercel Function
    │  Auth: Bearer base64(email:JIRA_API_TOKEN)
    │  Call: POST {JIRA_BASE_URL}/rest/api/3/issue/{key}/worklog
    │
    ▼
Atlassian Jira
```

Variables d'env du proxy :
- `JIRA_BASE_URL` (ex. `https://xxx.atlassian.net`)
- `JIRA_EMAIL`
- `JIRA_API_TOKEN`

Pour un usage solo, ces 3 vars suffisent. Pour un usage multi-user un jour, il faudrait passer en OAuth 2.0 (3-legged) — ~10× plus de boulot.

---

## Estimation effort

| Étape | Effort |
|---|---|
| Setup proxy Vercel + var env + endpoint POST | 1–2h |
| Ajout schéma : `jiraKey` projet + entry + `syncedAt` + migration localStorage | 1h |
| UI : champ Jira dans modal projet, override dans modal entrée | 1h |
| Composant "Pousser la semaine" + gestion des états (en cours / ok / erreur) | 2–3h |
| Tests + debug rate limit + retry logic | 1–2h |
| **Total** | **~6–10h** |

Beaucoup moins lourd que Supabase si l'objectif est juste "pousser dans Jira sans ressaisir".

---

## Questions ouvertes avant de se lancer

1. **Cloud ou Server/Data Center ?** Détermine les endpoints (`api/3` vs `api/2`) et l'auth (token vs PAT).
2. **Création d'API token autorisée ?** À tester via `id.atlassian.com/manage-profile/security/api-tokens` ou demander à l'IT.
3. **Comments OK à passer par un proxy externe ?** Si oui → Vercel suffit. Sinon → self-host le proxy en interne (Docker sur un serveur perso ?).
4. **Tickets pré-fetchés ?** Pour autocomplete dans le picker — appel `GET /rest/api/3/search?jql=assignee=currentUser()` au load, cache local. Pas indispensable au MVP.
5. **Bidirectionnel ou one-way ?** Push only au début, suffisant. Pull worklogs Jira → app = futur si besoin.

---

## Décision

À voir selon :
- La réponse de l'IT sur le token API
- Si Jira est Cloud (plus simple) ou Server/DC
- Si la pénibilité actuelle vaut ~1 weekend de dev

Si oui sur les 3, commencer par le MVP : proxy + un seul bouton "push entry" sur chaque bloc, sans gestion fancy du batch. Itérer après.

---

## Phase 2 — livrée ✓

### Code

- **Proxy** : [`proxy/`](../proxy/) — Express + Docker, déployable sur Dokploy
  - Endpoint : `POST /api/jira-worklog` → forward vers Jira `/rest/api/3/issue/{key}/worklog`
  - Healthcheck : `GET /healthz`
  - ADF (Atlassian Document Format) géré pour le champ comment
  - CORS configurable via env `ALLOWED_ORIGIN` (multi-origines séparées par virgule)
  - Validation : `issueKey`, `startedISO`, `timeSpentSeconds` (entier ≥ 60)
- **Frontend** :
  - `lib/jira.js` : helper `pushEntryToJira` + `getPushableEntries`
  - Settings : nouveau champ "URL du proxy" (à remplir après déploiement)
  - `pushWeekToJira` dans le root : itère séquentiellement sur les entrées poussables, met à jour `syncedAt` au succès
  - Bouton **"Pousser N sur Jira"** dans le header du RecapPanel — affiche progression `N/total` pendant le push
  - Badge `[KEY ✓]` (opacité plus basse) sur les entrées sync, `[KEY]` (opacité haute) sur les non-sync

### Restant à faire (côté toi)

1. **Créer le token Atlassian** sur https://id.atlassian.com/manage-profile/security/api-tokens (label "time-tracker-proxy")
2. **Déployer le proxy sur Dokploy** : voir [`proxy/README.md`](../proxy/README.md) pour la procédure complète (build context, env vars, healthcheck, domaine TLS)
3. **Coller l'URL du proxy** dans Réglages → URL du proxy (ex. `https://jira-proxy.tondomaine.com`)
4. **Tester** : créer une entrée avec une clé Jira, cliquer "Pousser N sur Jira", vérifier dans la timeline Jira

### Détails d'implémentation

- **Sequential push** (pas parallèle) : safe vis-à-vis du rate limit Jira (~10 req/s mais variable). Pour ~20 entrées la latence reste acceptable (<10s).
- **`syncedAt` n'est posé qu'au succès** : un retry après échec re-tente naturellement.
- **Aucune mutation côté Jira** : on POST des worklogs, on ne touche pas aux issues elles-mêmes.
- **Token jamais en clair côté client** : il vit uniquement dans la variable d'env Dokploy. Le frontend ne connaît que l'URL du proxy.
- **CORS** : le proxy n'autorise que l'origine listée. Si tu veux tester en local (`http://localhost:5173`), mets `ALLOWED_ORIGIN=https://warshoow.github.io,http://localhost:5173`.
