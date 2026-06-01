import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  createJiraIssue,
  createJiraIssueLink,
  fetchJiraEpics,
  fetchJiraIssueTypes,
  fetchJiraLinkTypes,
  fetchJiraProjects,
  fetchJiraSprints,
  fetchJiraStories,
} from "../../lib/jira.js";

// Modal de création d'un ticket Jira.
//   state : null | { jiraProjectKey, issueTypeName, parentKey, summary, description, labels, linkToStoryKey, linkTypeName }
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
  const [stories, setStories] = useState(null);
  const [linkTypes, setLinkTypes] = useState(null);
  const [sprints, setSprints] = useState(null);

  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [loadingEpics, setLoadingEpics] = useState(false);
  const [loadingStories, setLoadingStories] = useState(false);
  const [loadingSprints, setLoadingSprints] = useState(false);
  const [creating, setCreating] = useState(false);

  // Local UI : création inline d'une story
  const [newStoryOpen, setNewStoryOpen] = useState(false);
  const [newStoryTitle, setNewStoryTitle] = useState("");
  const [creatingStory, setCreatingStory] = useState(false);

  const opened = !!state;

  // Fetch des espaces + des link types à l'ouverture (les link types ne dépendent pas de l'espace)
  useEffect(() => {
    if (!opened || !proxyUrl) return;
    let cancelled = false;
    setProjects(null);
    setLinkTypes(null);
    setLoadingProjects(true);
    fetchJiraProjects({ proxyUrl }).then((res) => {
      if (cancelled) return;
      setProjects(res);
      setLoadingProjects(false);
    });
    fetchJiraLinkTypes({ proxyUrl }).then((res) => {
      if (!cancelled) setLinkTypes(res);
    });
    return () => {
      cancelled = true;
    };
  }, [opened, proxyUrl]);

  // Fetch des types d'issue + epics + stories + sprints quand l'espace change
  useEffect(() => {
    if (!opened || !proxyUrl || !state?.jiraProjectKey) {
      setIssuetypes(null);
      setEpics(null);
      setStories(null);
      setSprints(null);
      return;
    }
    let cancelled = false;
    setIssuetypes(null);
    setEpics(null);
    setStories(null);
    setSprints(null);
    setLoadingTypes(true);
    setLoadingEpics(true);
    setLoadingStories(true);
    setLoadingSprints(true);
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
    fetchJiraStories({ proxyUrl, projectKey: state.jiraProjectKey }).then(
      (res) => {
        if (!cancelled) {
          setStories(res);
          setLoadingStories(false);
        }
      }
    );
    fetchJiraSprints({ proxyUrl, projectKey: state.jiraProjectKey }).then(
      (res) => {
        if (!cancelled) {
          setSprints(res);
          setLoadingSprints(false);
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [opened, proxyUrl, state?.jiraProjectKey]);

  // Type de lien par défaut : on cherche un type dont le name ou l'outward contient "child".
  // Si trouvé, on pré-sélectionne. L'utilisateur peut overrider via le dropdown.
  const defaultLinkType = useMemo(() => {
    if (!linkTypes?.ok) return null;
    const wanted = (linkTypes.types || []).find((t) => {
      const n = (t.name || "").toLowerCase();
      const o = (t.outward || "").toLowerCase();
      return n.includes("child") || o.includes("child");
    });
    return wanted?.name || (linkTypes.types?.[0]?.name ?? null);
  }, [linkTypes]);

  // Pré-sélection du type de lien quand on choisit une story sans avoir encore set linkTypeName
  useEffect(() => {
    if (
      state?.linkToStoryKey &&
      !state?.linkTypeName &&
      defaultLinkType
    ) {
      setState((m) => (m ? { ...m, linkTypeName: defaultLinkType } : m));
    }
  }, [state?.linkToStoryKey, state?.linkTypeName, defaultLinkType, setState]);

  if (!state) return null;

  const typeIsEpic = state.issueTypeName?.toLowerCase() === "epic";
  const typeIsStory = state.issueTypeName?.toLowerCase() === "story";
  const showParentField =
    state.issueTypeName &&
    !typeIsEpic &&
    !(issuetypes?.issuetypes || []).find(
      (t) => t.name === state.issueTypeName && t.subtask
    );
  // Le lien à une story n'a de sens que pour les types qui ne sont pas Epic / Story
  const showStoryLink = state.issueTypeName && !typeIsEpic && !typeIsStory;
  // Sprint : pour Task / Bug / etc., mais pas Epic (qui span plusieurs sprints)
  // ni Story (les stories ne sont pas assignées à un sprint, seules les tâches le sont)
  const showSprintField =
    state.issueTypeName && !typeIsEpic && !typeIsStory;

  const canSubmit =
    state.jiraProjectKey &&
    state.issueTypeName &&
    state.summary.trim().length >= 3 &&
    (!showParentField || state.parentKey) &&
    // Si une story est sélectionnée, un type de lien doit l'être aussi
    (!state.linkToStoryKey || state.linkTypeName);

  // Crée une nouvelle story inline (sans logger de temps). Au succès, on la
  // sélectionne immédiatement comme story à lier.
  // Hérite de l'Epic parent du ticket en cours. PAS de sprint : par convention,
  // seules les tâches vont dans un sprint, pas les stories.
  const createNewStoryInline = async () => {
    const title = newStoryTitle.trim();
    if (title.length < 3) return;
    setCreatingStory(true);
    const res = await createJiraIssue({
      proxyUrl,
      projectKey: state.jiraProjectKey,
      issueTypeName: "Story",
      summary: title,
      parentKey: state.parentKey || undefined,
    });
    setCreatingStory(false);
    if (res.ok) {
      // Ajoute à la liste locale et auto-sélectionne
      setStories((s) =>
        s?.ok
          ? {
              ...s,
              stories: [
                { key: res.key, summary: title, status: "" },
                ...(s.stories || []),
              ],
            }
          : s
      );
      setState((m) => ({ ...m, linkToStoryKey: res.key }));
      setNewStoryOpen(false);
      setNewStoryTitle("");
    } else {
      alert(`Erreur création story : ${res.error}`);
    }
  };

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
      sprintId: showSprintField ? state.sprintId || undefined : undefined,
    });
    if (!res.ok) {
      setCreating(false);
      alert(`Erreur création : ${res.error}`);
      return;
    }

    // Si le proxy a remonté un warning sur l'ajout au sprint, on prévient mais
    // on continue (l'issue est créée).
    if (res.sprintWarning) {
      alert(
        `Ticket ${res.key} créé, mais ${res.sprintWarning}.\nTu peux l'ajouter manuellement au sprint dans Jira.`
      );
    }

    // Liaison à la story si demandée. Échec du link non bloquant : l'issue est créée.
    if (state.linkToStoryKey && state.linkTypeName) {
      const linkRes = await createJiraIssueLink({
        proxyUrl,
        typeName: state.linkTypeName,
        outwardKey: res.key, // perspective du nouveau ticket : "is X of [story]"
        inwardKey: state.linkToStoryKey,
      });
      if (!linkRes.ok) {
        alert(
          `Ticket ${res.key} créé, mais le lien à la story ${state.linkToStoryKey} a échoué : ${linkRes.error}\n\nTu peux l'ajouter manuellement dans Jira.`
        );
      }
    }

    setCreating(false);
    onCreated?.(res.key);
    onClose();
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
                    linkToStoryKey: "",
                    sprintId: "",
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
                      linkToStoryKey: "",
                      linkTypeName: "",
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

          {/* Lien à une Story (uniquement pour les types qui ne sont pas Epic / Story) */}
          {showStoryLink && (
            <div
              style={{
                padding: 12,
                border: "1px solid #2a262020",
                borderRadius: 3,
                background: "rgba(201, 71, 43, 0.03)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: 8,
                }}
              >
                <label className="label" style={{ margin: 0 }}>
                  Lier à une story (optionnel)
                </label>
                {!newStoryOpen && (
                  <button
                    type="button"
                    onClick={() => setNewStoryOpen(true)}
                    style={{
                      fontSize: 11,
                      color: "#c9472b",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    + Nouvelle story
                  </button>
                )}
              </div>

              {/* Dropdown des stories existantes */}
              {!newStoryOpen && (
                <>
                  {loadingStories ? (
                    <div className="input" style={{ color: "#2a262080" }}>
                      Chargement des stories…
                    </div>
                  ) : stories?.ok ? (
                    <select
                      className="select"
                      value={state.linkToStoryKey || ""}
                      onChange={(e) =>
                        setState((m) => ({
                          ...m,
                          linkToStoryKey: e.target.value,
                          // Reset le linkTypeName si on désélectionne
                          ...(e.target.value ? {} : { linkTypeName: "" }),
                        }))
                      }
                    >
                      <option value="">— aucune —</option>
                      {stories.stories.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.key} · {s.summary}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div style={{ fontSize: 11, color: "#c9472b" }}>
                      Erreur : {stories?.error}
                    </div>
                  )}

                  {/* Type de lien (visible seulement si une story est sélectionnée) */}
                  {state.linkToStoryKey && linkTypes?.ok && (
                    <div style={{ marginTop: 10 }}>
                      <label className="label" style={{ fontSize: 10 }}>
                        Type de lien
                      </label>
                      <select
                        className="select"
                        value={state.linkTypeName || ""}
                        onChange={(e) =>
                          setState((m) => ({
                            ...m,
                            linkTypeName: e.target.value,
                          }))
                        }
                      >
                        <option value="">— choisir —</option>
                        {linkTypes.types.map((t) => (
                          <option key={t.id} value={t.name}>
                            {t.outward
                              ? `${t.name} (${t.outward})`
                              : t.name}
                          </option>
                        ))}
                      </select>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#2a262080",
                          marginTop: 4,
                          lineHeight: 1.4,
                        }}
                      >
                        Le ticket créé sera "{state.linkTypeName || "…"}"{" "}
                        {state.linkToStoryKey}.
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Création inline d'une nouvelle story */}
              {newStoryOpen && (
                <div>
                  <label className="label" style={{ fontSize: 10 }}>
                    Titre de la story
                  </label>
                  <input
                    className="input"
                    autoFocus
                    placeholder="ex. Refonte parcours d'inscription"
                    value={newStoryTitle}
                    onChange={(e) => setNewStoryTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") createNewStoryInline();
                    }}
                  />
                  <div
                    style={{
                      fontSize: 11,
                      color: "#2a262080",
                      marginTop: 4,
                      marginBottom: 8,
                      lineHeight: 1.4,
                    }}
                  >
                    Sera créée dans l'espace {state.jiraProjectKey}
                    {state.parentKey ? ` sous l'epic ${state.parentKey}` : ""}.
                    Pas de temps loggé sur la story elle-même.
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setNewStoryOpen(false);
                        setNewStoryTitle("");
                      }}
                      disabled={creatingStory}
                      style={{ fontSize: 12, padding: "5px 10px" }}
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={createNewStoryInline}
                      disabled={
                        creatingStory || newStoryTitle.trim().length < 3
                      }
                      style={{ fontSize: 12, padding: "5px 10px" }}
                    >
                      {creatingStory ? "Création…" : "Créer la story"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sprint (pour tous sauf Epic) */}
          {showSprintField && (
            <div>
              <label className="label">Sprint (optionnel)</label>
              {loadingSprints ? (
                <div className="input" style={{ color: "#2a262080" }}>
                  Chargement des sprints…
                </div>
              ) : sprints?.ok ? (
                sprints.sprints.length === 0 ? (
                  <div
                    style={{
                      fontSize: 11,
                      color: "#2a262080",
                      fontStyle: "italic",
                      padding: "6px 0",
                    }}
                  >
                    Aucun sprint actif ou futur dans cet espace (vérifie qu'il
                    y a un Scrum board).
                  </div>
                ) : (
                  <select
                    className="select"
                    value={state.sprintId || ""}
                    onChange={(e) =>
                      setState((m) => ({ ...m, sprintId: e.target.value }))
                    }
                  >
                    <option value="">— aucun —</option>
                    {sprints.sprints.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.state === "active" ? "● " : ""}
                        {s.name}
                        {s.state === "future" ? " (à venir)" : ""}
                      </option>
                    ))}
                  </select>
                )
              ) : (
                <div style={{ fontSize: 11, color: "#c9472b" }}>
                  Erreur : {sprints?.error}
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
                <span className="mono">-</span>.
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
