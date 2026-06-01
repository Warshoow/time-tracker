import { Plus, X } from "lucide-react";
import {
  fmtDuration,
  hhmmFromMinutes,
  minutesFromHHMM,
} from "../../lib/date.js";
import { DURATION_OPTIONS } from "../../lib/constants.js";
import { defaultEntryJiraKey } from "../../lib/jira.js";

// state : { date, projectId, title, jiraKey, start, end } | null
export default function AddEntryModal({
  state,
  setState,
  projects,
  dayEndMin,
  jiraEnabled,
  onSubmit,
  onClose,
}) {
  if (!state) return null;

  const duration =
    minutesFromHHMM(state.end) - minutesFromHHMM(state.start);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(ev) => ev.stopPropagation()}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 6,
          }}
        >
          <h3
            className="display"
            style={{ margin: 0, fontSize: 22, fontWeight: 500 }}
          >
            Nouvelle entrée
          </h3>
          <button
            className="btn-icon"
            style={{ border: "none" }}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ marginBottom: 22 }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#2a262099",
              marginBottom: 4,
            }}
          >
            {new Date(state.date + "T00:00:00").toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </div>
          <div
            className="display"
            style={{
              fontSize: 32,
              fontWeight: 500,
              lineHeight: 1.1,
              letterSpacing: "-0.01em",
            }}
          >
            {state.start}
            <span style={{ color: "#2a262050", margin: "0 8px" }}>→</span>
            {state.end}
            <span
              className="mono"
              style={{
                fontSize: 12,
                color: "#2a262080",
                marginLeft: 10,
                fontWeight: 400,
              }}
            >
              {fmtDuration(Math.max(0, duration))}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label className="label">Projet</label>
            <select
              className="select"
              value={state.projectId}
              onChange={(ev) => {
                const newId = ev.target.value;
                const newProject = projects.find((p) => p.id === newId);
                setState((m) => ({
                  ...m,
                  projectId: newId,
                  jiraKey: defaultEntryJiraKey(newProject),
                }));
              }}
            >
              <option value="">— choisir —</option>
              {projects.map((p) => {
                const suffix = p.jiraKey
                  ? ` · ${p.jiraKey}`
                  : p.jiraProjectKey
                    ? ` · ${p.jiraProjectKey}`
                    : "";
                return (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {suffix}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="label">Tâche (optionnel)</label>
            <input
              className="input"
              autoFocus
              placeholder="ex. revue PR, daily…"
              value={state.title}
              onChange={(ev) =>
                setState((m) => ({ ...m, title: ev.target.value }))
              }
            />
          </div>

          {jiraEnabled && (
            <div>
              <label className="label">Issue Jira (optionnel)</label>
              <input
                className="input mono"
                placeholder="ex. API-42"
                value={state.jiraKey || ""}
                onChange={(ev) =>
                  setState((m) => ({
                    ...m,
                    jiraKey: ev.target.value.toUpperCase(),
                  }))
                }
              />
            </div>
          )}

          <div>
            <label className="label">Durée</label>
            <select
              className="select"
              value={duration}
              onChange={(ev) => {
                const durMin = Number(ev.target.value);
                setState((m) => {
                  const startMin = minutesFromHHMM(m.start);
                  const endMin = Math.min(startMin + durMin, dayEndMin);
                  return { ...m, end: hhmmFromMinutes(endMin) };
                });
              }}
            >
              {DURATION_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {fmtDuration(d)}
                </option>
              ))}
            </select>
          </div>
        </div>

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
            <Plus size={14} /> Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}
