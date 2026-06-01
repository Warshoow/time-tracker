import { Plus, Settings, Trash2 } from "lucide-react";
import { fmtDuration } from "../lib/date.js";
import { PROJECT_COLORS } from "../lib/constants.js";
import TimePicker from "./TimePicker.jsx";

export default function Sidebar({
  projects,
  weekTotal,
  weekEntriesCount,
  selectedDay,
  form,
  setForm,
  formDuration, // déjà calculée par le parent
  dayStart,
  dayEnd,
  jiraEnabled,
  onAddEntry,
  onOpenCreateProject,
  onOpenEditProject,
  onRemoveProject,
  onOpenSettings,
}) {
  const projectColor = (id) => {
    const idx = projects.findIndex((p) => p.id === id);
    return PROJECT_COLORS[idx % PROJECT_COLORS.length] || PROJECT_COLORS[0];
  };

  return (
    <aside
      style={{
        borderRight: "1px solid #2a262020",
        padding: "28px 24px",
        background: "rgba(255, 252, 245, 0.4)",
        display: "flex",
        flexDirection: "column",
        gap: 28,
        overflowY: "auto",
        position: "sticky",
        top: 0,
        alignSelf: "start",
        height: "100vh",
      }}
    >
      {/* Logo / titre */}
      <div>
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            color: "#2a262099",
            marginBottom: 4,
          }}
        >
          Carnet de
        </div>
        <h1
          className="display"
          style={{
            fontSize: 38,
            margin: 0,
            fontWeight: 500,
            lineHeight: 1,
            letterSpacing: "-0.02em",
          }}
        >
          temps
        </h1>
        <div
          style={{
            marginTop: 10,
            height: 1,
            background: "linear-gradient(to right, #2a2620 0%, #2a262020 100%)",
          }}
        />
      </div>

      {/* Stats semaine */}
      <div>
        <div className="label">Cette semaine</div>
        <div
          className="display"
          style={{ fontSize: 32, fontWeight: 500, lineHeight: 1 }}
        >
          {fmtDuration(weekTotal)}
        </div>
        <div
          className="mono"
          style={{ fontSize: 11, color: "#2a262080", marginTop: 4 }}
        >
          {weekEntriesCount} entrées
        </div>
      </div>

      {/* Form d'ajout rapide */}
      <div>
        <div className="label" style={{ marginBottom: 12 }}>
          Nouvelle entrée
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label className="label" style={{ fontSize: 10 }}>
              Projet
            </label>
            <select
              className="select"
              value={form.projectId}
              onChange={(e) =>
                setForm((f) => ({ ...f, projectId: e.target.value }))
              }
            >
              <option value="">— choisir —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" style={{ fontSize: 10 }}>
              Tâche (optionnel)
            </label>
            <input
              className="input"
              placeholder="ex. revue PR, daily…"
              value={form.title}
              onChange={(e) =>
                setForm((f) => ({ ...f, title: e.target.value }))
              }
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label className="label" style={{ fontSize: 10 }}>
                Début
              </label>
              <TimePicker
                value={form.start}
                onChange={(v) => setForm((f) => ({ ...f, start: v }))}
                min={dayStart}
                max={dayEnd}
                step={15}
              />
            </div>
            <div>
              <label className="label" style={{ fontSize: 10 }}>
                Fin
              </label>
              <TimePicker
                value={form.end}
                onChange={(v) => setForm((f) => ({ ...f, end: v }))}
                min={dayStart}
                max={dayEnd}
                step={15}
              />
            </div>
          </div>

          <div
            className="mono"
            style={{
              fontSize: 11,
              color: "#2a262080",
              textAlign: "right",
            }}
          >
            durée : {fmtDuration(Math.max(0, formDuration))}
            {" · "}jour :{" "}
            {new Date(selectedDay + "T00:00:00").toLocaleDateString("fr-FR", {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}
          </div>

          <button className="btn btn-primary" onClick={onAddEntry}>
            <Plus size={14} /> Ajouter au calendrier
          </button>
        </div>
      </div>

      {/* Projets */}
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <div className="label" style={{ margin: 0 }}>
            Projets
          </div>
          <button
            className="btn-icon"
            onClick={onOpenCreateProject}
            aria-label="Ajouter un projet"
            style={{ border: "none" }}
          >
            <Plus size={14} />
          </button>
        </div>

        {projects.length === 0 ? (
          <div
            style={{
              fontSize: 12,
              color: "#2a262080",
              fontStyle: "italic",
              padding: "12px 0",
            }}
          >
            Aucun projet. Crée-en un pour commencer.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {projects.map((p) => {
              const c = projectColor(p.id);
              return (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "6px 8px",
                    borderRadius: 2,
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "rgba(42,38,32,0.04)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      background: c.bg,
                      borderRadius: "50%",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    onClick={() => onOpenEditProject(p)}
                    style={{
                      flex: 1,
                      fontSize: 13,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      cursor: "pointer",
                    }}
                    title="Modifier le projet"
                  >
                    {p.name}
                    {jiraEnabled && (p.jiraKey || p.jiraProjectKey) && (
                      <span
                        className="mono"
                        style={{
                          fontSize: 10,
                          color: "#2a262080",
                          marginLeft: 6,
                        }}
                        title={
                          p.jiraKey
                            ? "Issue par défaut"
                            : p.jiraProjectName
                              ? `Espace : ${p.jiraProjectName}`
                              : "Espace Jira"
                        }
                      >
                        [{p.jiraKey || p.jiraProjectKey}]
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => onRemoveProject(p.id)}
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      color: "#2a262060",
                      padding: 2,
                      display: "flex",
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer settings */}
      <div style={{ marginTop: "auto", paddingTop: 16 }}>
        <button
          className="btn"
          style={{ width: "100%", justifyContent: "center" }}
          onClick={onOpenSettings}
        >
          <Settings size={13} /> Réglages
        </button>
      </div>
    </aside>
  );
}
