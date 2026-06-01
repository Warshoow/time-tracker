import express from "express";
import cors from "cors";

const {
  JIRA_BASE_URL,
  JIRA_EMAIL,
  JIRA_API_TOKEN,
  ALLOWED_ORIGIN = "https://warshoow.github.io",
  PORT = 3000,
} = process.env;

if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {
  console.error(
    "Missing required env vars: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN"
  );
  process.exit(1);
}

const authHeader =
  "Basic " +
  Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");

const app = express();

// CORS : autorise plusieurs origines via virgule, sinon une seule.
const allowedOrigins = ALLOWED_ORIGIN.split(",").map((s) => s.trim());
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // curl, healthcheck
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`Origin ${origin} not allowed`));
    },
  })
);
app.use(express.json({ limit: "16kb" }));

app.get("/healthz", (_req, res) => res.json({ ok: true }));

// Helper : appelle Jira en GET et retourne JSON ou propage l'erreur.
async function jiraGet(path) {
  const url = `${JIRA_BASE_URL.replace(/\/$/, "")}${path}`;
  console.log(`→ GET ${path}`);
  const r = await fetch(url, {
    method: "GET",
    headers: { Authorization: authHeader, Accept: "application/json" },
  });
  const body = await r.text();
  if (!r.ok) {
    console.error(`← ${r.status} on ${path}: ${body.slice(0, 200)}`);
    const err = new Error(`Jira ${r.status}`);
    err.status = r.status;
    err.body = body.slice(0, 500);
    err.path = path;
    throw err;
  }
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

// Liste les "espaces" (projects) Jira accessibles au compte du token.
// Retourne [{ key, name, projectTypeKey }] — pagination ignorée (limite 50 par défaut, suffisant en usage perso).
app.get("/api/jira-projects", async (_req, res) => {
  const url = `${JIRA_BASE_URL.replace(/\/$/, "")}/rest/api/3/project/search?maxResults=50&orderBy=name`;
  try {
    const r = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: authHeader,
        Accept: "application/json",
      },
    });
    if (!r.ok) {
      const text = await r.text();
      return res.status(r.status).json({
        error: "Jira API error",
        status: r.status,
        details: text.slice(0, 500),
      });
    }
    const data = await r.json();
    const projects = (data.values || []).map((p) => ({
      key: p.key,
      name: p.name,
      projectTypeKey: p.projectTypeKey,
    }));
    res.json({ ok: true, projects, total: data.total });
  } catch (e) {
    console.error("Proxy error (projects):", e);
    res.status(502).json({ error: "Proxy error", details: String(e) });
  }
});

// Convertit une date ISO type "2026-05-18T07:30:00.000Z" en format attendu par Jira :
// "2026-05-18T07:30:00.000+0000" (l'offset doit être collé sans ":")
const formatJiraDate = (iso) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) throw new Error("Invalid date");
  // toISOString → "YYYY-MM-DDTHH:mm:ss.sssZ"
  const s = d.toISOString();
  return s.replace("Z", "+0000");
};

// ADF (Atlassian Document Format) requis par l'API v3 pour le champ comment.
const buildAdfComment = (text) => ({
  type: "doc",
  version: 1,
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text }],
    },
  ],
});

// Liste les types d'issue disponibles pour un espace donné.
// Retourne [{ id, name, subtask }] — utilisé pour peupler le dropdown du modal de création.
app.get("/api/jira-issuetypes", async (req, res) => {
  const { projectKey } = req.query;
  if (!projectKey) return res.status(400).json({ error: "projectKey requis" });
  try {
    // Nouvel endpoint (l'ancien /issue/createmeta?expand=... a été dégagé).
    const data = await jiraGet(
      `/rest/api/3/issue/createmeta/${encodeURIComponent(
        projectKey
      )}/issuetypes`
    );
    // Le nouveau endpoint retourne soit { issueTypes: [...] } soit { values: [...] }
    // selon la version. On gère les deux.
    const raw = data.issueTypes || data.values || [];
    const types = raw.map((t) => ({
      id: t.id,
      name: t.name,
      subtask: !!t.subtask,
    }));
    res.json({ ok: true, issuetypes: types });
  } catch (e) {
    console.error("Proxy error (issuetypes):", e);
    res
      .status(e.status || 502)
      .json({
        error: "Jira API error",
        details: e.body || String(e),
        calledPath: e.path,
      });
  }
});

// Liste les Epics d'un espace (utile pour choisir le parent d'une Story/Tâche).
app.get("/api/jira-epics", async (req, res) => {
  const { projectKey } = req.query;
  if (!projectKey) return res.status(400).json({ error: "projectKey requis" });
  const jql = `project="${projectKey}" AND issuetype=Epic ORDER BY created DESC`;
  try {
    // Nouvelle API /search/jql (l'ancienne /search a été dégagée — HTTP 410).
    // Pagination cursor-based via nextPageToken, on prend juste la 1ère page (50 max).
    const data = await jiraGet(
      `/rest/api/3/search/jql?jql=${encodeURIComponent(
        jql
      )}&fields=summary,status&maxResults=50`
    );
    const epics = (data.issues || []).map((i) => ({
      key: i.key,
      summary: i.fields?.summary || "",
      status: i.fields?.status?.name || "",
    }));
    res.json({ ok: true, epics, isLast: data.isLast });
  } catch (e) {
    console.error("Proxy error (epics):", e);
    res
      .status(e.status || 502)
      .json({
        error: "Jira API error",
        details: e.body || String(e),
        calledPath: e.path,
      });
  }
});

// Liste les sprints actifs + futurs d'un espace (via les Scrum boards associés).
// Les Kanban boards n'ont pas de sprint donc ils sont skip.
app.get("/api/jira-sprints", async (req, res) => {
  const { projectKey } = req.query;
  if (!projectKey) return res.status(400).json({ error: "projectKey requis" });
  try {
    // 1) Récupère les boards du projet (Agile API)
    const boardsData = await jiraGet(
      `/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(
        projectKey
      )}&maxResults=50`
    );
    const boards = boardsData.values || [];

    // 2) Pour chaque Scrum board, fetch les sprints actifs + futurs
    const allSprints = [];
    for (const board of boards) {
      if (board.type !== "scrum") continue;
      try {
        const sprintsData = await jiraGet(
          `/rest/agile/1.0/board/${board.id}/sprint?state=active,future&maxResults=50`
        );
        for (const s of sprintsData.values || []) {
          allSprints.push({
            id: s.id,
            name: s.name,
            state: s.state,
            boardName: board.name,
            startDate: s.startDate,
            endDate: s.endDate,
          });
        }
      } catch (e) {
        // Certains boards peuvent fail (permissions), on continue les autres
        console.warn(
          `Failed to fetch sprints for board ${board.id}: ${e.message}`
        );
      }
    }

    // Dédup par id (un sprint peut apparaître sur plusieurs boards)
    const seen = new Set();
    const unique = allSprints.filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });

    // Tri : actifs d'abord, puis par date de début ascendante
    unique.sort((a, b) => {
      if (a.state === "active" && b.state !== "active") return -1;
      if (b.state === "active" && a.state !== "active") return 1;
      return (a.startDate || "").localeCompare(b.startDate || "");
    });

    res.json({ ok: true, sprints: unique });
  } catch (e) {
    console.error("Proxy error (sprints):", e);
    res.status(e.status || 502).json({
      error: "Jira API error",
      details: e.body || String(e),
      calledPath: e.path,
    });
  }
});

// Liste les Stories d'un espace (pour pouvoir lier une Tâche en cours de création).
app.get("/api/jira-stories", async (req, res) => {
  const { projectKey } = req.query;
  if (!projectKey) return res.status(400).json({ error: "projectKey requis" });
  const jql = `project="${projectKey}" AND issuetype=Story ORDER BY created DESC`;
  try {
    const data = await jiraGet(
      `/rest/api/3/search/jql?jql=${encodeURIComponent(
        jql
      )}&fields=summary,status&maxResults=50`
    );
    const stories = (data.issues || []).map((i) => ({
      key: i.key,
      summary: i.fields?.summary || "",
      status: i.fields?.status?.name || "",
    }));
    res.json({ ok: true, stories });
  } catch (e) {
    console.error("Proxy error (stories):", e);
    res
      .status(e.status || 502)
      .json({
        error: "Jira API error",
        details: e.body || String(e),
        calledPath: e.path,
      });
  }
});

// Liste les types de lien (issue link types) — utilisés pour la relation Task ↔ Story.
app.get("/api/jira-link-types", async (_req, res) => {
  try {
    const data = await jiraGet(`/rest/api/3/issueLinkType`);
    const types = (data.issueLinkTypes || []).map((t) => ({
      id: t.id,
      name: t.name,
      inward: t.inward,
      outward: t.outward,
    }));
    res.json({ ok: true, types });
  } catch (e) {
    console.error("Proxy error (link types):", e);
    res
      .status(e.status || 502)
      .json({
        error: "Jira API error",
        details: e.body || String(e),
        calledPath: e.path,
      });
  }
});

// Crée un lien entre deux issues.
//   outwardKey : l'issue source (perspective "outward" du type, ex. "is child of X")
//   inwardKey  : l'issue cible (la liée, ex. la Story parente)
app.post("/api/jira-issue-link", async (req, res) => {
  const { typeName, outwardKey, inwardKey } = req.body || {};
  if (!typeName || !outwardKey || !inwardKey) {
    return res
      .status(400)
      .json({ error: "typeName, outwardKey, inwardKey requis" });
  }
  const url = `${JIRA_BASE_URL.replace(/\/$/, "")}/rest/api/3/issueLink`;
  try {
    console.log(
      `→ POST /rest/api/3/issueLink (${typeName}: ${outwardKey} → ${inwardKey})`
    );
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        type: { name: typeName },
        outwardIssue: { key: outwardKey },
        inwardIssue: { key: inwardKey },
      }),
    });
    if (!r.ok) {
      const text = await r.text();
      console.error(`← ${r.status} on link create: ${text.slice(0, 200)}`);
      return res.status(r.status).json({
        error: "Jira API error",
        status: r.status,
        details: text.slice(0, 500),
      });
    }
    // POST /issueLink retourne 201 Created sans body
    res.json({ ok: true });
  } catch (e) {
    console.error("Proxy error (issue link):", e);
    res.status(502).json({ error: "Proxy error", details: String(e) });
  }
});

// Crée un ticket Jira (Epic, Story, Tâche, …).
// Body : { projectKey, issueTypeName, summary, description?, parentKey?, labels?, sprintId? }
app.post("/api/jira-issue", async (req, res) => {
  const {
    projectKey,
    issueTypeName,
    summary,
    description,
    parentKey,
    labels,
    sprintId,
  } = req.body || {};

  if (!projectKey || typeof projectKey !== "string") {
    return res.status(400).json({ error: "projectKey requis (string)" });
  }
  if (!issueTypeName || typeof issueTypeName !== "string") {
    return res.status(400).json({ error: "issueTypeName requis (string)" });
  }
  if (!summary || typeof summary !== "string" || summary.trim().length < 3) {
    return res.status(400).json({ error: "summary requis (≥ 3 caractères)" });
  }

  const fields = {
    project: { key: projectKey },
    issuetype: { name: issueTypeName },
    summary: summary.trim(),
  };
  if (description && String(description).trim()) {
    fields.description = buildAdfComment(String(description).trim());
  }
  if (parentKey && typeof parentKey === "string") {
    fields.parent = { key: parentKey };
  }
  if (Array.isArray(labels) && labels.length > 0) {
    fields.labels = labels
      .map((l) => String(l).trim())
      .filter(Boolean)
      // Jira interdit les espaces dans les labels
      .map((l) => l.replace(/\s+/g, "-"));
  }

  const url = `${JIRA_BASE_URL.replace(/\/$/, "")}/rest/api/3/issue`;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ fields }),
    });
    if (!r.ok) {
      const text = await r.text();
      return res.status(r.status).json({
        error: "Jira API error",
        status: r.status,
        details: text.slice(0, 500),
      });
    }
    const data = await r.json();

    // Si sprintId fourni, on ajoute l'issue au sprint via l'Agile API.
    // Échec non bloquant : l'issue est créée, on remonte juste un warning.
    let sprintWarning;
    if (sprintId) {
      try {
        console.log(
          `→ POST /rest/agile/1.0/sprint/${sprintId}/issue (${data.key})`
        );
        const sprintRes = await fetch(
          `${JIRA_BASE_URL.replace(/\/$/, "")}/rest/agile/1.0/sprint/${sprintId}/issue`,
          {
            method: "POST",
            headers: {
              Authorization: authHeader,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({ issues: [data.key] }),
          }
        );
        if (!sprintRes.ok) {
          const txt = await sprintRes.text();
          console.error(
            `← ${sprintRes.status} on add to sprint: ${txt.slice(0, 200)}`
          );
          sprintWarning = `Ajout au sprint ${sprintId} a échoué (${sprintRes.status})`;
        }
      } catch (e) {
        console.warn("Error adding to sprint:", e);
        sprintWarning = `Ajout au sprint ${sprintId} a échoué (${e.message})`;
      }
    }

    res.json({
      ok: true,
      key: data.key,
      id: data.id,
      ...(sprintWarning ? { sprintWarning } : {}),
    });
  } catch (e) {
    console.error("Proxy error (create issue):", e);
    res.status(502).json({ error: "Proxy error", details: String(e) });
  }
});

// Extrait le texte simple d'un objet ADF (Atlassian Document Format).
// Utile pour ramener un comment Jira au format text plain côté client.
function extractAdfText(adf) {
  if (!adf) return "";
  if (typeof adf === "string") return adf;
  if (!adf.content) return "";
  const out = [];
  const walk = (node) => {
    if (!node) return;
    if (node.type === "text" && node.text) out.push(node.text);
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  walk(adf);
  return out.join(" ").trim();
}

// Liste les worklogs de l'utilisateur courant sur une plage de dates [from, to] (YYYY-MM-DD).
// Stratégie : 1) JQL pour trouver les issues ayant des worklogs dans la plage,
// 2) pour chaque issue, fetch ses worklogs filtrés par auteur + date.
app.get("/api/jira-week-worklogs", async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to)
    return res.status(400).json({ error: "from et to requis (YYYY-MM-DD)" });

  try {
    // 1) Récupère l'accountId du user (pour filtrer les worklogs)
    const me = await jiraGet(`/rest/api/3/myself`);
    const myAccountId = me.accountId;

    // 2) Cherche les issues qui ont des worklogs de moi dans la plage
    const jql = `worklogAuthor = currentUser() AND worklogDate >= "${from}" AND worklogDate <= "${to}"`;
    const search = await jiraGet(
      `/rest/api/3/search/jql?jql=${encodeURIComponent(
        jql
      )}&fields=summary,project&maxResults=100`
    );

    // 3) Pour chaque issue, fetch ses worklogs filtrés par date + auteur
    const fromTs = new Date(`${from}T00:00:00`).getTime();
    const toTs = new Date(`${to}T23:59:59`).getTime();
    const items = [];

    for (const issue of search.issues || []) {
      const worklogsData = await jiraGet(
        `/rest/api/3/issue/${encodeURIComponent(
          issue.key
        )}/worklog?startedAfter=${fromTs}&startedBefore=${toTs}`
      );
      const mine = (worklogsData.worklogs || [])
        .filter((w) => w.author?.accountId === myAccountId)
        .map((w) => ({
          id: w.id,
          started: w.started,
          timeSpentSeconds: w.timeSpentSeconds,
          comment: extractAdfText(w.comment),
        }));
      if (mine.length === 0) continue;
      items.push({
        issueKey: issue.key,
        issueSummary: issue.fields?.summary || "",
        projectKey: issue.fields?.project?.key || "",
        worklogs: mine,
      });
    }

    res.json({ ok: true, items });
  } catch (e) {
    console.error("Proxy error (week-worklogs):", e);
    res.status(e.status || 502).json({
      error: "Jira API error",
      details: e.body || String(e),
      calledPath: e.path,
    });
  }
});

app.post("/api/jira-worklog", async (req, res) => {
  const { issueKey, startedISO, timeSpentSeconds, comment } = req.body || {};

  if (!issueKey || typeof issueKey !== "string") {
    return res.status(400).json({ error: "issueKey requis (string)" });
  }
  if (!startedISO) {
    return res.status(400).json({ error: "startedISO requis (ISO 8601)" });
  }
  if (!Number.isInteger(timeSpentSeconds) || timeSpentSeconds < 60) {
    return res
      .status(400)
      .json({ error: "timeSpentSeconds requis (entier ≥ 60)" });
  }

  let started;
  try {
    started = formatJiraDate(startedISO);
  } catch {
    return res.status(400).json({ error: "startedISO invalide" });
  }

  const url = `${JIRA_BASE_URL.replace(/\/$/, "")}/rest/api/3/issue/${encodeURIComponent(
    issueKey
  )}/worklog`;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        timeSpentSeconds,
        started,
        ...(comment ? { comment: buildAdfComment(String(comment)) } : {}),
      }),
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(r.status).json({
        error: "Jira API error",
        status: r.status,
        details: text.slice(0, 500),
      });
    }
    const data = await r.json();
    res.json({ ok: true, worklogId: data.id });
  } catch (e) {
    console.error("Proxy error:", e);
    res.status(502).json({ error: "Proxy error", details: String(e) });
  }
});

// Update (PUT) d'un worklog existant — utilisé quand on a resize une entrée
// déjà synced et qu'on veut propager la nouvelle plage horaire à Jira.
// Body : { issueKey, startedISO, timeSpentSeconds, comment? }
app.put("/api/jira-worklog/:worklogId", async (req, res) => {
  const { worklogId } = req.params;
  const { issueKey, startedISO, timeSpentSeconds, comment } = req.body || {};

  if (!issueKey) return res.status(400).json({ error: "issueKey requis" });
  if (!startedISO) return res.status(400).json({ error: "startedISO requis" });
  if (!Number.isInteger(timeSpentSeconds) || timeSpentSeconds < 60) {
    return res
      .status(400)
      .json({ error: "timeSpentSeconds requis (entier ≥ 60)" });
  }

  let started;
  try {
    started = formatJiraDate(startedISO);
  } catch {
    return res.status(400).json({ error: "startedISO invalide" });
  }

  const url = `${JIRA_BASE_URL.replace(/\/$/, "")}/rest/api/3/issue/${encodeURIComponent(
    issueKey
  )}/worklog/${encodeURIComponent(worklogId)}`;

  try {
    console.log(`→ PUT /rest/api/3/issue/${issueKey}/worklog/${worklogId}`);
    const r = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        timeSpentSeconds,
        started,
        ...(comment ? { comment: buildAdfComment(String(comment)) } : {}),
      }),
    });
    if (!r.ok) {
      const text = await r.text();
      console.error(`← ${r.status} on PUT worklog: ${text.slice(0, 200)}`);
      return res.status(r.status).json({
        error: "Jira API error",
        status: r.status,
        details: text.slice(0, 500),
      });
    }
    const data = await r.json();
    res.json({ ok: true, worklogId: data.id });
  } catch (e) {
    console.error("Proxy error (update worklog):", e);
    res.status(502).json({ error: "Proxy error", details: String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`Jira proxy listening on :${PORT}`);
  console.log(`Allowed origins: ${allowedOrigins.join(", ")}`);
});
