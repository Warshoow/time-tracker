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

// Liste les entrées poussables : ont une clé Jira effective, pas encore sync.
export function getPushableEntries(entries, projects) {
  return entries.filter((e) => {
    if (e.syncedAt) return false;
    const projectKey = projects.find((p) => p.id === e.projectId)?.jiraKey;
    return !!(e.jiraKey || projectKey);
  });
}
