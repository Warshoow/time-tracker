import { X } from "lucide-react";

// state : { id?, name, jiraKey } | null
// onSubmit : crée si pas d'id, met à jour sinon (logique côté parent).
export default function ProjectModal({ state, setState, jiraEnabled, onSubmit, onClose }) {
  if (!state) return null;

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
          <div style={{ marginTop: 14 }}>
            <label className="label">Issue Jira par défaut (optionnel)</label>
            <input
              className="input mono"
              placeholder="ex. API-42"
              value={state.jiraKey}
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
              Utilisée par défaut pour les nouvelles entrées de ce projet.
              Tu pourras la surcharger entrée par entrée.
            </div>
          </div>
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
