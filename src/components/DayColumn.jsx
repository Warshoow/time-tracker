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
  jiraBaseUrl,
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

  // Couleur d'une entrée distante : si un projet tracker est mappé à l'espace Jira,
  // on prend sa couleur (cohérence visuelle). Sinon hash du projectKey.
  const colorForRemote = (entry) => {
    const localMatch = projects.find(
      (p) => p.jiraProjectKey && p.jiraProjectKey === entry.jiraProjectKey
    );
    if (localMatch) return projectColor(localMatch.id);
    const seed = (entry.jiraProjectKey || entry.jiraKey || "").split("").reduce(
      (acc, c) => acc + c.charCodeAt(0),
      0
    );
    return PROJECT_COLORS[seed % PROJECT_COLORS.length];
  };

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

          // Pour une entrée remote (worklog Jira fetched), on n'a pas de projet local.
          // On synthétise un objet projet-like pour l'affichage et on désactive les
          // interactions (resize / delete) car la source de vérité est dans Jira.
          const isRemote = !!e.isRemote;
          const project = isRemote
            ? { name: e.jiraSummary || e.jiraKey, isRemote: true }
            : projectById(e.projectId);
          const color = isRemote ? colorForRemote(e) : projectColor(e.projectId);
          const keyToShow = isRemote
            ? e.jiraKey
            : jiraEnabled
              ? effectiveJiraKey(e)
              : "";

          return (
            <EntryBlock
              key={e.id}
              entry={e}
              project={project}
              color={color}
              top={top}
              height={height}
              leftPct={leftPct}
              widthPct={widthPct}
              jiraKey={keyToShow}
              jiraBaseUrl={jiraBaseUrl}
              isRemote={isRemote}
              onStartResize={
                isRemote ? null : (ev, edge) => onStartResize(ev, e, edge)
              }
              onRemove={isRemote ? null : () => onRemoveEntry(e.id)}
            />
          );
        })}
      </div>
    </div>
  );
}
