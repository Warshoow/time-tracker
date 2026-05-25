import { X } from "lucide-react";
import TimePicker from "../TimePicker.jsx";

export default function SettingsModal({ settings, setSettings, onClose }) {
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
            Réglages
          </h3>
          <button
            className="btn-icon"
            style={{ border: "none" }}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        {/* Section Plage horaire */}
        <div className="label" style={{ marginBottom: 10 }}>
          Plage horaire
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label className="label" style={{ fontSize: 10 }}>
              Début
            </label>
            <TimePicker
              value={settings.dayStart}
              onChange={(v) => setSettings((s) => ({ ...s, dayStart: v }))}
              min="00:00"
              max="23:30"
              step={30}
            />
          </div>
          <div>
            <label className="label" style={{ fontSize: 10 }}>
              Fin
            </label>
            <TimePicker
              value={settings.dayEnd}
              onChange={(v) => setSettings((s) => ({ ...s, dayEnd: v }))}
              min="00:30"
              max="23:30"
              step={30}
            />
          </div>
        </div>

        {/* Section Jira */}
        <div
          style={{
            marginTop: 24,
            paddingTop: 20,
            borderTop: "1px solid #2a262020",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <div className="label" style={{ margin: 0 }}>
              Intégration Jira
            </div>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              <input
                type="checkbox"
                checked={settings.jira?.enabled || false}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    jira: { ...(s.jira || {}), enabled: e.target.checked },
                  }))
                }
              />
              <span>{settings.jira?.enabled ? "Activée" : "Désactivée"}</span>
            </label>
          </div>
          <div
            style={{
              fontSize: 11,
              color: "#2a262080",
              marginBottom: 12,
              lineHeight: 1.4,
            }}
          >
            Quand activée, les projets et les entrées peuvent porter une issue
            Jira (ex. <span className="mono">API-42</span>). Le push effectif
            vers Jira sera ajouté en Phase&nbsp;2.
          </div>

          {settings.jira?.enabled && (
            <div>
              <label className="label" style={{ fontSize: 10 }}>
                URL Jira Cloud
              </label>
              <input
                className="input"
                placeholder="https://macompagnie.atlassian.net"
                value={settings.jira?.baseUrl || ""}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    jira: { ...(s.jira || {}), baseUrl: e.target.value.trim() },
                  }))
                }
              />
            </div>
          )}
        </div>

        <div
          style={{
            marginTop: 24,
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button className="btn btn-primary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
