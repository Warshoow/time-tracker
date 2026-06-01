import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { fetchJiraProjects } from "../../lib/jira.js";

// state : { id?, name, jiraProjectKey, jiraProjectName, jiraKey } | null
// onSubmit : crée si pas d'id, met à jour sinon (logique côté parent).
export default function ProjectModal({
  state,
  setState,
  jiraEnabled,
  proxyUrl,
  onSubmit,
  onClose,
}) {
  const [jiraProjects, setJiraProjects] = useState(null); // null | { ok, projects, error }
  const [loading, setLoading] = useState(false);

  // Fetch des espaces Jira à chaque ouverture du modal (transition closed → open).
  // `!!state` capture le passage null → objet, peu importe si c'est création (pas d'id) ou édition.
  const opened = !!state;
  useEffect(() => {
    if (!opened || !jiraEnabled || !proxyUrl) return;
    let cancelled = false;
    setJiraProjects(null);
    setLoading(true);
    fetchJiraProjects({ proxyUrl }).then((res) => {
      if (cancelled) return;
      setJiraProjects(res);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [opened, jiraEnabled, proxyUrl]);

  if (!state) return null;

  const issuePlaceholder = state.jiraProjectKey
    ? `ex. ${state.jiraProjectKey}-42`
    : "ex. API-42";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <h3
            className="display"
            style={{ margin: 0, fontSize: 22, fontWeight: 500 }}
          >
            {state.id ? "Modifier le projet" : "Nouveau projet"}
          </h3>
          <button
            className="btn-icon"
            style={{ border: "none" }}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <label className="label">Nom du projet</label>
        <input
          autoFocus
          className="input"
          placeholder="ex. Refonte API, Onboarding…"
          value={state.name}
          onChange={(e) => setState((m) => ({ ...m, name: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit();
          }}
        />

        {jiraEnabled && (
          <>
            <div style={{ marginTop: 14 }}>
              <label className="label">Espace Jira (optionnel)</label>
              {!proxyUrl ? (
                <div
                  style={{
                    fontSize: 11,
                    color: "#2a262080",
                    fontStyle: "italic",
                    padding: "8px 0",
                  }}
                >
                  Configure l'URL du proxy dans Réglages pour activer le sélecteur.
                </div>
              ) : loading ? (
                <div
                  className="input"
                  style={{ color: "#2a262080", fontStyle: "italic" }}
                >
                  Chargement des espaces…
                </div>
              ) : jiraProjects?.ok ? (
                <select
                  className="select"
                  value={state.jiraProjectKey || ""}
                  onChange={(e) => {
                    const key = e.target.value;
                    const proj = jiraProjects.projects.find(
                      (p) => p.key === key
                    );
                    setState((m) => ({
                      ...m,
                      jiraProjectKey: key || undefined,
                      jiraProjectName: proj?.name || undefined,
                      // Auto-remplit le nom du projet tracker si encore vide
                      name: m.name.trim() ? m.name : proj?.name || m.name,
                    }));
                  }}
                >
                  <option value="">— aucun —</option>
                  {jiraProjects.projects.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.key} · {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div
                  style={{
                    fontSize: 11,
                    color: "#c9472b",
                    padding: "8px 0",
                    lineHeight: 1.4,
                  }}
                >
                  Erreur de chargement : {jiraProjects?.error || "inconnue"}.
                  Vérifie que le proxy tourne et que le token est valide.
                </div>
              )}
            </div>

            <div style={{ marginTop: 14 }}>
              <label className="label">
                Issue Jira par défaut (optionnel)
              </label>
              <input
                className="input mono"
                placeholder={issuePlaceholder}
                value={state.jiraKey || ""}
                onChange={(e) =>
                  setState((m) => ({
                    ...m,
                    jiraKey: e.target.value.toUpperCase(),
                  }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSubmit();
                }}
              />
              <div
                style={{
                  fontSize: 11,
                  color: "#2a262080",
                  marginTop: 6,
                  lineHeight: 1.4,
                }}
              >
                Si renseignée, toutes les nouvelles entrées de ce projet
                pointent par défaut sur ce ticket précis. Sinon, le préfixe de
                l'espace est utilisé.
              </div>
            </div>
          </>
        )}

        <div
          style={{
            marginTop: 22,
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={onSubmit}>
            {state.id ? "Mettre à jour" : "Créer"}
          </button>
        </div>
      </div>
    </div>
  );
}
