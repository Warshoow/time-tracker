import { minutesFromHHMM } from "../lib/date.js";
import { PROJECT_COLORS, SNAP_MIN, HOUR_HEIGHT } from "../lib/constants.js";
import EntryBlock from "./EntryBlock.jsx";
import HoverGuide from "./HoverGuide.jsx";

// Layout des entrées qui se chevauchent : algo glouton de colonnes côte-à-côte.
function layoutEntries(dayEntries) {
  const sorted = [...dayEntries].sort(
    (a, b) => minutesFromHHMM(a.start) - minutesFromHHMM(b.start)
  );
  const columns = [];
  const placement = new Map();
  for (const e of sorted) {
    const s = minutesFromHHMM(e.start);
    let placed = false;
    for (let ci = 0; ci < columns.length; ci++) {
      const col = columns[ci];
      const last = col[col.length - 1];
      if (minutesFromHHMM(last.end) <= s) {
        col.push(e);
        placement.set(e.id, ci);
        placed = true;
        break;
      }
    }
    if (!placed) {
      columns.push([e]);
      placement.set(e.id, columns.length - 1);
    }
  }
  return { columns: columns.length || 1, placement };
}

export default function DayColumn({
  dayKey,
  isSelected,
  entries,
  projects,
  dayStartMin,
  dayEndMin,
  totalMin,
  pxPerMin,
  hourLines,
  hoverMinutes, // minutes si la souris est sur cette colonne, sinon null
  jiraEnabled,
  onSelectDay,
  onOpenAddModal,
  onHoverChange,
  onHoverLeave,
  onStartResize,
  onRemoveEntry,
}) {
  const { columns, placement } = layoutEntries(entries);
  const projectIndex = (id) => projects.findIndex((p) => p.id === id);
  const projectColor = (id) =>
    PROJECT_COLORS[projectIndex(id) % PROJECT_COLORS.length] ||
    PROJECT_COLORS[0];
  const projectById = (id) => projects.find((p) => p.id === id);

  const effectiveJiraKey = (entry) =>
    entry.jiraKey || projectById(entry.projectId)?.jiraKey || "";

  return (
    <div
      onClick={onSelectDay}
      style={{
        position: "relative",
        borderRight: "1px solid #2a262020",
        background: isSelected ? "rgba(201, 71, 43, 0.03)" : "transparent",
        cursor: "pointer",
        overflow: "hidden",
        gridRow: "2",
      }}
    >
      <div
        style={{ position: "relative", height: (totalMin / 60) * HOUR_HEIGHT }}
        onContextMenu={(ev) => {
          ev.preventDefault();
          const rect = ev.currentTarget.getBoundingClientRect();
          const y = ev.clientY - rect.top;
          const mins =
            dayStartMin + Math.round(y / pxPerMin / SNAP_MIN) * SNAP_MIN;
          onOpenAddModal(mins);
        }}
        onMouseMove={(ev) => {
          const rect = ev.currentTarget.getBoundingClientRect();
          const y = ev.clientY - rect.top;
          const snapped =
            dayStartMin + Math.round(y / pxPerMin / SNAP_MIN) * SNAP_MIN;
          const clamped = Math.max(
            dayStartMin,
            Math.min(snapped, dayEndMin)
          );
          onHoverChange(clamped);
        }}
        onMouseLeave={onHoverLeave}
      >
        {hoverMinutes != null && (
          <HoverGuide
            minutes={hoverMinutes}
            dayStartMin={dayStartMin}
            pxPerMin={pxPerMin}
          />
        )}

        {/* Lignes d'heures */}
        {hourLines.map((h) => {
          const top = (h * 60 - dayStartMin) * pxPerMin;
          if (top < 0 || top > totalMin * pxPerMin) return null;
          return (
            <div
              key={h}
              style={{
                position: "absolute",
                top,
                left: 0,
                right: 0,
                borderTop: "1px solid #2a262012",
              }}
            />
          );
        })}

        {/* Entrées */}
        {entries.map((e) => {
          const s = minutesFromHHMM(e.start);
          const en = minutesFromHHMM(e.end);
          const top = Math.max(0, (s - dayStartMin) * pxPerMin);
          const height = Math.max(18, (en - s) * pxPerMin - 2);
          const col = placement.get(e.id) || 0;
          const widthPct = 100 / columns;
          const leftPct = col * widthPct;

          return (
            <EntryBlock
              key={e.id}
              entry={e}
              project={projectById(e.projectId)}
              color={projectColor(e.projectId)}
              top={top}
              height={height}
              leftPct={leftPct}
              widthPct={widthPct}
              jiraKey={jiraEnabled ? effectiveJiraKey(e) : ""}
              onStartResize={(ev, edge) => onStartResize(ev, e, edge)}
              onRemove={() => onRemoveEntry(e.id)}
            />
          );
        })}
      </div>
    </div>
  );
}
