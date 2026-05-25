import { X } from "lucide-react";
import { minutesFromHHMM } from "../lib/date.js";

// 3 layouts selon la durée :
//   ≤ 15 min        → compact (1 ligne centrée verticalement)
//   16–59 min       → inline  (Project · Title) + plage horaire
//   ≥ 60 min        → full    (project / title / time sur 3 lignes)
export default function EntryBlock({
  entry,
  project,
  color,
  top,
  height,
  leftPct,
  widthPct,
  jiraKey, // clé effective déjà résolue par le parent
  onStartResize,
  onRemove,
}) {
  const s = minutesFromHHMM(entry.start);
  const en = minutesFromHHMM(entry.end);
  const dur = en - s;
  const layoutMode = dur <= 15 ? "compact" : dur < 60 ? "inline" : "full";

  const synced = !!entry.syncedAt;
  const jiraBadge = jiraKey && (
    <span
      className="mono"
      style={{
        fontSize: 9,
        color: color.bg,
        opacity: synced ? 0.45 : 0.8,
        marginLeft: 5,
      }}
      title={synced ? `Synchronisé le ${entry.syncedAt}` : "Non synchronisé"}
    >
      [{jiraKey}{synced ? " ✓" : ""}]
    </span>
  );

  const headerLine = (
    <div
      style={{
        fontSize: 11,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        paddingRight: 16,
        width: "100%",
      }}
    >
      <span style={{ fontWeight: 600, color: color.bg }}>
        {project?.name || "—"}
      </span>
      {jiraBadge}
      {entry.title && (
        <span style={{ opacity: 0.75, marginLeft: 6 }}>
          · {entry.title}
        </span>
      )}
    </div>
  );

  const timeLine = (
    <div
      className="mono"
      style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}
    >
      {entry.start}–{entry.end}
    </div>
  );

  return (
    <div
      className={`entry-block entry-${layoutMode} fade-in`}
      style={{
        top,
        height,
        left: `calc(${leftPct}% + 3px)`,
        width: `calc(${widthPct}% - 6px)`,
        background: color.soft,
        borderLeftColor: color.bg,
      }}
      onClick={(ev) => ev.stopPropagation()}
      onContextMenu={(ev) => {
        ev.preventDefault();
        ev.stopPropagation();
      }}
    >
      <div
        className="resize-handle resize-top"
        onMouseDown={(ev) => onStartResize(ev, "top")}
        aria-label="Redimensionner début"
      />
      <div
        className="resize-handle resize-bottom"
        onMouseDown={(ev) => onStartResize(ev, "bottom")}
        aria-label="Redimensionner fin"
      />
      <button
        className="delete-btn"
        onClick={onRemove}
        aria-label="Supprimer"
      >
        <X size={11} />
      </button>

      {layoutMode === "compact" && headerLine}

      {layoutMode === "inline" && (
        <>
          {headerLine}
          {timeLine}
        </>
      )}

      {layoutMode === "full" && (
        <>
          <div
            style={{
              fontWeight: 600,
              fontSize: 11,
              color: color.bg,
              marginBottom: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              paddingRight: 16,
            }}
          >
            {project?.name || "—"}
            {jiraBadge}
          </div>
          {entry.title && (
            <div
              style={{
                fontSize: 11,
                opacity: 0.85,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {entry.title}
            </div>
          )}
          {timeLine}
        </>
      )}
    </div>
  );
}
