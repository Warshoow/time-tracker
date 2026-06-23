import { minutesFromHHMM } from "./date.js";

// Pousse une entrée vers Jira via le proxy. Retourne { ok, error?, worklogId? }.
// proxyUrl : ex. "https://jira-proxy.tondomaine.com" (sans /api/jira-worklog).
export async function pushEntryToJira({ entry, project, proxyUrl }) {
  const issueKey = entry.jiraKey || project?.jiraKey || "";
  if (!proxyUrl) return { ok: false, error: "URL proxy non configurée" };
  if (!issueKey) return { ok: false, error: "Issue Jira manquante" };

  const startMin = minutesFromHHMM(entry.start);
  const endMin = minutesFromHHMM(entry.end);
  const durationSec = (endMin - startMin) * 60;
  if (durationSec < 60) return { ok: false, error: "Durée < 1 minute" };

  // Construit la date locale : entry.date + entry.start → ISO UTC.
  // Jira affichera dans la timezone de profil de l'utilisateur.
  const startedISO = new Date(
    `${entry.date}T${entry.start}:00`
  ).toISOString();

  const url = `${proxyUrl.replace(/\/$/, "")}/api/jira-worklog`;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        issueKey,
        startedISO,
        timeSpentSeconds: durationSec,
        comment: entry.title || "",
      }),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      return {
        ok: false,
        error: data.error || data.details || `HTTP ${r.status}`,
      };
    }
    const data = await r.json();
    return { ok: true, worklogId: data.worklogId };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

// Helper interne : fetch JSON depuis le proxy avec gestion d'erreur uniforme.
async function callProxy({ proxyUrl, path, method = "GET", body }) {
  if (!proxyUrl) return { ok: false, error: "URL proxy non configurée" };
  try {
    const r = await fetch(`${proxyUrl.replace(/\/$/, "")}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const detail = data.details || data.error || `HTTP ${r.status}`;
      const suffix = data.calledPath ? ` (URL : ${data.calledPath})` : "";
      return { ok: false, error: `${detail}${suffix}` };
    }
    return data;
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

// Récupère la liste des espaces (projects) Jira via le proxy.
// Retourne { ok, projects, error? } où projects = [{ key, name, projectTypeKey }].
export async function fetchJiraProjects({ proxyUrl }) {
  const data = await callProxy({ proxyUrl, path: "/api/jira-projects" });
  if (!data.ok) return data;
  return { ok: true, projects: data.projects || [], total: data.total };
}

// Liste les types d'issue disponibles pour un espace (Epic, Story, Tâche, etc.).
export async function fetchJiraIssueTypes({ proxyUrl, projectKey }) {
  if (!projectKey) return { ok: false, error: "projectKey requis" };
  const data = await callProxy({
    proxyUrl,
    path: `/api/jira-issuetypes?projectKey=${encodeURIComponent(projectKey)}`,
  });
  if (!data.ok) return data;
  return { ok: true, issuetypes: data.issuetypes || [] };
}

// Liste les Epics d'un espace (pour choisir le parent d'une Story/Tâche).
export async function fetchJiraEpics({ proxyUrl, projectKey }) {
  if (!projectKey) return { ok: false, error: "projectKey requis" };
  const data = await callProxy({
    proxyUrl,
    path: `/api/jira-epics?projectKey=${encodeURIComponent(projectKey)}`,
  });
  if (!data.ok) return data;
  return { ok: true, epics: data.epics || [] };
}

// Liste les sprints actifs + futurs d'un espace (via les Scrum boards associés).
export async function fetchJiraSprints({ proxyUrl, projectKey }) {
  if (!projectKey) return { ok: false, error: "projectKey requis" };
  const data = await callProxy({
    proxyUrl,
    path: `/api/jira-sprints?projectKey=${encodeURIComponent(projectKey)}`,
  });
  if (!data.ok) return data;
  return { ok: true, sprints: data.sprints || [] };
}

// Liste les Stories d'un espace (pour le picker "Lier à une story").
export async function fetchJiraStories({ proxyUrl, projectKey }) {
  if (!projectKey) return { ok: false, error: "projectKey requis" };
  const data = await callProxy({
    proxyUrl,
    path: `/api/jira-stories?projectKey=${encodeURIComponent(projectKey)}`,
  });
  if (!data.ok) return data;
  return { ok: true, stories: data.stories || [] };
}

// Liste les types de lien disponibles dans l'instance Jira.
export async function fetchJiraLinkTypes({ proxyUrl }) {
  const data = await callProxy({ proxyUrl, path: "/api/jira-link-types" });
  if (!data.ok) return data;
  return { ok: true, types: data.types || [] };
}

// Crée un lien entre deux issues (ex. Task "is child of" Story).
export async function createJiraIssueLink({
  proxyUrl,
  typeName,
  outwardKey,
  inwardKey,
}) {
  return callProxy({
    proxyUrl,
    path: "/api/jira-issue-link",
    method: "POST",
    body: { typeName, outwardKey, inwardKey },
  });
}

// Crée un ticket Jira. Retourne { ok, key?, sprintWarning?, error? }.
// issueTypeId est préféré quand dispo (plus robuste face aux renames côté Jira).
// issueTypeName est gardé en fallback.
export async function createJiraIssue({
  proxyUrl,
  projectKey,
  issueTypeId,
  issueTypeName,
  summary,
  description,
  parentKey,
  labels,
  sprintId,
}) {
  return callProxy({
    proxyUrl,
    path: "/api/jira-issue",
    method: "POST",
    body: {
      projectKey,
      ...(issueTypeId ? { issueTypeId } : {}),
      ...(issueTypeName ? { issueTypeName } : {}),
      summary,
      ...(description ? { description } : {}),
      ...(parentKey ? { parentKey } : {}),
      ...(labels && labels.length > 0 ? { labels } : {}),
      ...(sprintId ? { sprintId } : {}),
    },
  });
}

// Une vraie clé d'issue Jira ressemble à BACK-42 : préfixe alpha + tiret + numéro.
// Sert à filtrer les saisies incomplètes ("BACK-" ou vides) avant un push.
export function isValidIssueKey(key) {
  return /^[A-Z][A-Z0-9_]*-\d+$/.test(String(key || "").trim());
}

// Fetch les worklogs du user pour une plage de dates [from, to] (inclus).
// Retourne { ok, items: [{ issueKey, issueSummary, projectKey, worklogs: [...] }] }
export async function fetchWeekWorklogs({ proxyUrl, from, to }) {
  const data = await callProxy({
    proxyUrl,
    path: `/api/jira-week-worklogs?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  });
  if (!data.ok) return data;
  return { ok: true, items: data.items || [] };
}

// Valeur par défaut du champ jiraKey d'une entrée, dérivée du projet :
//   - si le projet a une issue explicite (jiraKey) → on l'utilise telle quelle
//   - sinon si le projet pointe vers un espace (jiraProjectKey) → on renvoie "{KEY}-"
//     pour que l'utilisateur n'ait plus qu'à taper le numéro
//   - sinon "" (vide, à saisir manuellement)
export function defaultEntryJiraKey(project) {
  if (!project) return "";
  if (project.jiraKey) return project.jiraKey;
  if (project.jiraProjectKey) return `${project.jiraProjectKey}-`;
  return "";
}

// Met à jour un worklog existant via le proxy (PUT).
// Retourne { ok, worklogId?, error? }.
export async function updateJiraWorklog({
  entry,
  project,
  proxyUrl,
  worklogId,
}) {
  const issueKey = entry.jiraKey || project?.jiraKey || "";
  if (!proxyUrl) return { ok: false, error: "URL proxy non configurée" };
  if (!worklogId) return { ok: false, error: "worklogId requis" };
  if (!issueKey) return { ok: false, error: "Issue Jira manquante" };

  const startMin = minutesFromHHMM(entry.start);
  const endMin = minutesFromHHMM(entry.end);
  const durationSec = (endMin - startMin) * 60;
  if (durationSec < 60) return { ok: false, error: "Durée < 1 minute" };

  const startedISO = new Date(`${entry.date}T${entry.start}:00`).toISOString();

  return callProxy({
    proxyUrl,
    path: `/api/jira-worklog/${encodeURIComponent(worklogId)}`,
    method: "PUT",
    body: {
      issueKey,
      startedISO,
      timeSpentSeconds: durationSec,
      comment: entry.title || "",
    },
  });
}

// Liste les entrées à pousser/synchroniser :
//   - pas encore sync ET avec clé valide  → POST (création worklog)
//   - sync mais modifiée depuis (dirtySinceSync) → PUT (mise à jour worklog)
export function getPushableEntries(entries, projects) {
  return entries.filter((e) => {
    // Si pas sync, c'est une création potentielle
    if (!e.syncedAt) {
      const projectKey = projects.find((p) => p.id === e.projectId)?.jiraKey;
      return !!(e.jiraKey || projectKey);
    }
    // Sync mais modifiée depuis : update
    if (e.dirtySinceSync && e.jiraWorklogId) return true;
    return false;
  });
}
