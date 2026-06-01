import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  createJiraIssue,
  fetchJiraEpics,
  fetchJiraIssueTypes,
  fetchJiraProjects,
} from "../../lib/jira.js";

// Modal de création d'un ticket Jira.
//   state : null | { jiraProjectKey, issueTypeName, parentKey, summary, description, labels }
//   onCreated : (newKey) => void   — appelé au succès avec la clé créée
export default function CreateIssueModal({
  state,
  setState,
  proxyUrl,
  onClose,
  onCreated,
}) {
  // Fetchs : on garde tout local au modal pour éviter de coupler au root.
  const [projects, setProjects] = useState(null);
  const [issuetypes, setIssuetypes] = useState(null);
  const [epics, setEpics] = useState(null);

  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [loadingEpics, setLoadingEpics] = useState(false);
  const [creating, setCreating] = useState(false);

  const opened = !!state;

  // Fetch des espaces à l'ouverture
  useEffect(() => {
    if (!opened || !proxyUrl) return;
    let cancelled = false;
    setProjects(null);
    setLoadingProjects(true);
    fetchJiraProjects({ proxyUrl }).then((res) => {
      if (cancelled) return;
      setProjects(res);
      setLoadingProjects(false);
    });
    return () => {
      cancelled = true;
    };
  }, [opened, proxyUrl]);

  // Fetch des types d'issue + epics quand l'espace change
  useEffect(() => {
    if (!opened || !proxyUrl || !state?.jiraProjectKey) {
      setIssuetypes(null);
      setEpics(null);
      return;
    }
    let cancelled = false;
    setIssuetypes(null);
    setEpics(null);
    setLoadingTypes(true);
    setLoadingEpics(true);
    fetchJiraIssueTypes({ proxyUrl, projectKey: state.jiraProjectKey }).then(
      (res) => {
        if (!cancelled) {
          setIssuetypes(res);
          setLoadingTypes(false);
        }
      }
    );
    fetchJiraEpics({ proxyUrl, projectKey: state.jiraProjectKey }).then(
      (res) => {
        if (!cancelled) {
          setEpics(res);
          setLoadingEpics(false);
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [opened, proxyUrl, state?.jiraProjectKey]);

  if (!state) return null;

  const showParentField =
    state.issueTypeName &&
    state.issueTypeName.toLowerCase() !== "epic" &&
    !(issuetypes?.issuetypes || []).find(
      (t) => t.name === state.issueTypeName && t.subtask
    );

  const canSubmit =
    state.jiraProjectKey &&
    state.issueTypeName &&
    state.summary.trim().length >= 3 &&
    (!showParentField || state.parentKey);

  const submit = async () => {
    if (!canSubmit) return;
    setCreating(true);
    const labels = state.labels
      ? state.labels
          .split(",")
          .map((l) => l.trim())
          .filter(Boolean)
      : [];
    const res = await createJiraIssue({
      proxyUrl,
      projectKey: state.jiraProjectKey,
      issueTypeName: state.issueTypeName,
      summary: state.summary,
      description: state.description,
      parentKey: showParentField ? state.parentKey : undefined,
      labels,
    });
    setCreating(false);
    if (res.ok) {
      onCreated?.(res.key);
      onClose();
    } else {
      alert(`Erreur création : ${res.error}`);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 500 }}
      >
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
            Nouveau ticket Jira
          </h3>
          <button
            className="btn-icon"
            style={{ border: "none" }}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Espace */}
          <div>
            <label className="label">Espace Jira</label>
            {!proxyUrl ? (
              <div style={{ fontSize: 11, color: "#2a262080", padding: "8px 0" }}>
                Configure l'URL du proxy dans Réglages.
              </div>
            ) : loadingProjects ? (
              <div className="input" style={{ color: "#2a262080" }}>
                Chargement…
              </div>
            ) : projects?.ok ? (
              <select
                className="select"
                value={state.jiraProjectKey}
                onChange={(e) =>
                  setState((m) => ({
                    ...m,
                    jiraProjectKey: e.target.value,
                    issueTypeName: "",
                    parentKey: "",
                  }))
                }
              >
                <option value="">— choisir —</option>
                {projects.projects.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.key} · {p.name}
                  </option>
                ))}
              </select>
            ) : (
              <div style={{ fontSize: 11, color: "#c9472b" }}>
                Erreur : {projects?.error}
              </div>
            )}
          </div>

          {/* Type d'issue */}
          {state.jiraProjectKey && (
            <div>
              <label className="label">Type</label>
              {loadingTypes ? (
                <div className="input" style={{ color: "#2a262080" }}>
                  Chargement…
                </div>
              ) : issuetypes?.ok ? (
                <select
                  className="select"
                  value={state.issueTypeName}
                  onChange={(e) =>
                    setState((m) => ({
                      ...m,
                      issueTypeName: e.target.value,
                      parentKey: "",
                    }))
                  }
                >
                  <option value="">— choisir —</option>
                  {issuetypes.issuetypes
                    .filter((t) => !t.subtask)
                    .map((t) => (
                      <option key={t.id} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                </select>
              ) : (
                <div style={{ fontSize: 11, color: "#c9472b" }}>
                  Erreur : {issuetypes?.error}
                </div>
              )}
            </div>
          )}

          {/* Epic parent (Story / Tâche) */}
          {showParentField && (
            <div>
              <label className="label">Epic parent</label>
              {loadingEpics ? (
                <div className="input" style={{ color: "#2a262080" }}>
                  Chargement des epics…
                </div>
              ) : epics?.ok ? (
                epics.epics.length === 0 ? (
                  <div
                    style={{
                      fontSize: 11,
                      color: "#2a262080",
                      fontStyle: "italic",
                      padding: "6px 0",
                    }}
                  >
                    Aucune Epic dans cet espace. Crée d'abord une Epic.
                  </div>
                ) : (
                  <select
                    className="select"
                    value={state.parentKey}
                    onChange={(e) =>
                      setState((m) => ({ ...m, parentKey: e.target.value }))
                    }
                  >
                    <option value="">— choisir —</option>
                    {epics.epics.map((ep) => (
                      <option key={ep.key} value={ep.key}>
                        {ep.key} · {ep.summary}
                      </option>
                    ))}
                  </select>
                )
              ) : (
                <div style={{ fontSize: 11, color: "#c9472b" }}>
                  Erreur : {epics?.error}
                </div>
              )}
            </div>
          )}

          {/* Summary */}
          {state.issueTypeName && (
            <div>
              <label className="label">Titre</label>
              <input
                className="input"
                autoFocus
                placeholder="ex. Implémenter le filtre par projet"
                value={state.summary}
                onChange={(e) =>
                  setState((m) => ({ ...m, summary: e.target.value }))
                }
              />
            </div>
          )}

          {/* Description */}
          {state.issueTypeName && (
            <div>
              <label className="label">Description (optionnel)</label>
              <textarea
                className="input"
                rows={3}
                style={{ resize: "vertical", fontFamily: "inherit" }}
                placeholder="Contexte, AC, liens utiles…"
                value={state.description}
                onChange={(e) =>
                  setState((m) => ({ ...m, description: e.target.value }))
                }
              />
            </div>
          )}

          {/* Labels */}
          {state.issueTypeName && (
            <div>
              <label className="label">Labels (optionnel)</label>
              <input
                className="input mono"
                placeholder="ex. backend, urgent, story-foo"
                value={state.labels}
                onChange={(e) =>
                  setState((m) => ({ ...m, labels: e.target.value }))
                }
              />
              <div
                style={{
                  fontSize: 11,
                  color: "#2a262080",
                  marginTop: 6,
                  lineHeight: 1.4,
                }}
              >
                Séparés par virgule. Les espaces sont remplacés par
                <span className="mono">-</span>. Utile pour lier une tâche à une
                story selon ta convention Jira.
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            marginTop: 22,
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button className="btn" onClick={onClose} disabled={creating}>
            Annuler
          </button>
          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={!canSubmit || creating}
          >
            <Plus size={14} /> {creating ? "Création…" : "Créer"}
          </button>
        </div>
      </div>
    </div>
  );
}
