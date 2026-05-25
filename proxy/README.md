# Jira proxy

Petit serveur Express qui reçoit les requêtes du frontend (Time Tracker) et les forwarde à l'API Jira Cloud avec le token API stocké côté serveur.

**Pourquoi un proxy** : l'API Jira bloque CORS depuis un browser, et le token ne doit jamais vivre dans le code client.

## Endpoints

- `GET /healthz` → `{ ok: true }` (pour Dokploy healthcheck)
- `POST /api/jira-worklog` → forwarde vers `POST /rest/api/3/issue/{key}/worklog`
  - Body : `{ issueKey, startedISO, timeSpentSeconds, comment? }`
  - Réponse : `{ ok: true, worklogId }` ou `{ error, status, details }`

## Variables d'environnement

Voir [.env.example](.env.example). Toutes obligatoires sauf `ALLOWED_ORIGIN` et `PORT` (défauts présents).

## Local

```bash
cd proxy
cp .env.example .env       # remplir les vraies valeurs
npm install
npm run dev                # ou npm start
```

Test rapide :
```bash
curl http://localhost:3000/healthz
```

## Déploiement Dokploy

1. **Créer une application** dans Dokploy → type **Application** → source **Git**
2. **Repository** : `https://github.com/Warshoow/time-tracker`
3. **Branch** : `master` (ou `develop` pour tester)
4. **Build context** : `./proxy` (ne pas oublier le `./`)
5. **Build type** : Dockerfile (auto-détecté grâce au `Dockerfile` présent)
6. **Port** : `3000`
7. **Domain** : un sous-domaine type `jira-proxy.tondomaine.com` → Dokploy auto-provision le cert Let's Encrypt
8. **Environment variables** : remplir les 4 obligatoires (voir .env.example) + ajuster `ALLOWED_ORIGIN` si ton frontend tourne ailleurs que GH Pages
9. **Healthcheck** : path `/healthz`, port `3000`
10. **Deploy** → vérifier les logs ("Jira proxy listening on :3000")

Une fois en ligne, dans l'app Time Tracker → Réglages → coller l'URL du proxy (`https://jira-proxy.tondomaine.com`) dans le champ prévu, et tester avec une entrée.

## Déploiement Portainer (alternative)

Si tu veux héberger côté boulot ou ailleurs via Portainer (qui ne gère pas le TLS contrairement à Dokploy), tu utilises la feature **Stacks** :

1. **Stacks → Add stack** → **Repository** comme méthode
2. **Repository URL** : `https://github.com/Warshoow/time-tracker`
3. **Repository reference** : `refs/heads/master` (ou `develop`)
4. **Compose path** : `proxy/docker-compose.yml` *(important : pas juste `docker-compose.yml`)*
5. **Environment variables** : remplir `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `ALLOWED_ORIGIN`
6. **Deploy the stack**

Le conteneur expose le port 3000 sur le host. Mets ensuite un reverse proxy devant (nginx, HAProxy via pfSense, Caddy…) qui :
- Gère le TLS (Let's Encrypt)
- Forwarde `https://jira-proxy.tondomaine.com` → `http://localhost:3000`

Exemple de bloc nginx :
```nginx
server {
  listen 443 ssl;
  server_name jira-proxy.tondomaine.com;
  # ssl_certificate ... (cert managé par certbot)

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

Si Portainer tourne sur la même machine que pfSense, tu peux aussi exposer via le reverse proxy HAProxy de pfSense (interface Services → HAProxy).

**Redéploiement** : Portainer peut être configuré pour pull le repo périodiquement (option "Automatic updates"), ou tu déclenches manuellement via le bouton **Update the stack**.

## Création du token API Atlassian

1. Aller sur https://id.atlassian.com/manage-profile/security/api-tokens
2. **Create API token** → label "time-tracker-proxy" → copier la valeur
3. La coller dans la variable `JIRA_API_TOKEN` de Dokploy
4. Si tu perds le token, il faut en regénérer un (impossible de le revoir après création)

## Re-déploiement après update du code

Dokploy peut être configuré pour redeployer automatiquement sur push GitHub (webhook). Sinon : bouton **Deploy** dans l'UI Dokploy.
