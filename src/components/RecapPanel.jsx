import { Fragment } from "react";
import { Upload } from "lucide-react";
import { fmtDateKey, fmtDayLabel, fmtDayNum, fmtDuration } from "../lib/date.js";
import { PROJECT_COLORS } from "../lib/constants.js";

// Tableau projet × jour, avec totaux ligne (par projet) et colonne (par jour).
// Caché par le parent s'il n'y a aucune entrée cette semaine.
export default function RecapPanel({
  recap,
  days,
  todayKey,
  totalsByDay,
  weekTotal,
  projects,
  jiraEnabled,
  pushableCount,
  pushState,
  onPushWeek,
}) {
  const pushRunning = !!pushState?.running;
  const showPushBtn = jiraEnabled && (pushableCount > 0 || pushRunning);
  const projectColor = (id) => {
    const idx = projects.findIndex((p) => p.id === id);
    return PROJECT_COLORS[idx % PROJECT_COLORS.length] || PROJECT_COLORS[0];
  };

  // Pour les lignes synthétiques "Jira · KEY" (espaces Jira sans projet tracker
  // mappé), on dérive la couleur par hash de l'id pour rester déterministe et
  // cohérent avec ce qu'affiche DayColumn pour ces mêmes entrées.
  const colorForRow = (project) => {
    if (!project.isRemoteGroup) return projectColor(project.id);
    const seed = (project.id || "")
      .split("")
      .reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return PROJECT_COLORS[seed % PROJECT_COLORS.length];
  };

  return (
    <div
      style={{
        marginTop: 18,
        border: "1px solid #2a262020",
        borderRadius: 3,
        background: "rgba(255, 252, 245, 0.5)",
        padding: "16px 20px",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          gap: 12,
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "#2a262099",
          }}
        >
          Répartition par projet
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="mono" style={{ fontSize: 11, color: "#2a262080" }}>
            {recap.length} projet{recap.length > 1 ? "s" : ""} actif
            {recap.length > 1 ? "s" : ""}
          </div>
          {showPushBtn && (
            <button
              className="btn btn-primary"
              onClick={onPushWeek}
              disabled={pushRunning}
              style={{ fontSize: 12, padding: "6px 12px" }}
            >
              <Upload size={12} />
              {pushRunning
                ? `Push ${pushState.done}/${pushState.total}…`
                : `Pousser ${pushableCount} sur Jira`}
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(140px, 1.4fr) repeat(5, 1fr) 90px",
          rowGap: 6,
          columnGap: 12,
          alignItems: "center",
          fontSize: 12,
        }}
      >
        {/* Header */}
        <div />
        {days.map((d) => {
          const isToday = fmtDateKey(d) === todayKey;
          return (
            <div
              key={fmtDateKey(d)}
              className="mono"
              style={{
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                color: isToday ? "#c9472b" : "#2a262099",
                textAlign: "right",
              }}
            >
              {fmtDayLabel(d)} {fmtDayNum(d)}
            </div>
          );
        })}
        <div
          className="mono"
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            color: "#2a262099",
            textAlign: "right",
          }}
        >
          Total
        </div>

        {/* Lignes par projet */}
        {recap.map(({ project, perDay, total }) => {
          const c = colorForRow(project);
          return (
            <Fragment key={project.id}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: c.bg,
                    flexShrink: 0,
                    ...(project.isRemoteGroup
                      ? { border: `1px dashed ${c.bg}`, background: "transparent" }
                      : {}),
                  }}
                />
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: 13,
                    ...(project.isRemoteGroup
                      ? { fontStyle: "italic", opacity: 0.85 }
                      : {}),
                  }}
                  title={
                    project.isRemoteGroup
                      ? "Espace Jira sans projet tracker mappé"
                      : undefined
                  }
                >
                  {project.name}
                </span>
              </div>
              {perDay.map((m, i) => (
                <div
                  key={i}
                  className="mono"
                  style={{
                    textAlign: "right",
                    fontSize: 11,
                    color: m > 0 ? "#2a2620" : "#2a262040",
                  }}
                >
                  {m > 0 ? fmtDuration(m) : "—"}
                </div>
              ))}
              <div
                className="mono"
                style={{
                  textAlign: "right",
                  fontSize: 12,
                  fontWeight: 600,
                  color: c.bg,
                }}
              >
                {fmtDuration(total)}
              </div>
            </Fragment>
          );
        })}

        {/* Ligne total jour */}
        <div
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            color: "#2a262099",
            paddingTop: 8,
            borderTop: "1px solid #2a262020",
            marginTop: 4,
          }}
        >
          Total jour
        </div>
        {days.map((d) => {
          const dt = totalsByDay[fmtDateKey(d)] || 0;
          return (
            <div
              key={fmtDateKey(d)}
              className="mono"
              style={{
                textAlign: "right",
                fontSize: 11,
                paddingTop: 8,
                borderTop: "1px solid #2a262020",
                marginTop: 4,
                color: dt > 0 ? "#2a2620" : "#2a262040",
              }}
            >
              {dt > 0 ? fmtDuration(dt) : "—"}
            </div>
          );
        })}
        <div
          className="mono"
          style={{
            textAlign: "right",
            fontSize: 12,
            fontWeight: 600,
            paddingTop: 8,
            borderTop: "1px solid #2a262020",
            marginTop: 4,
          }}
        >
          {fmtDuration(weekTotal)}
        </div>
      </div>
    </div>
  );
}
