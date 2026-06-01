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

app.listen(PORT, () => {
  console.log(`Jira proxy listening on :${PORT}`);
  console.log(`Allowed origins: ${allowedOrigins.join(", ")}`);
});
