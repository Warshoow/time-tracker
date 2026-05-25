import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  fmtDateKey,
  fmtDayLabel,
  fmtDayNum,
  fmtDuration,
  fmtMonthYear,
} from "../lib/date.js";
import { HOUR_HEIGHT } from "../lib/constants.js";
import DayColumn from "./DayColumn.jsx";
import RecapPanel from "./RecapPanel.jsx";

export default function Calendar({
  weekStart,
  days,
  selectedDay,
  todayKey,
  projects,
  entriesByDay,
  totalsByDay,
  weekTotal,
  recap,
  dayStartMin,
  dayEndMin,
  jiraEnabled,
  hoverPos, // { dayKey, minutes } | null
  hoverSuppressed, // true si resize ou modal ouvert
  onSelectDay,
  onPrevWeek,
  onNextWeek,
  onToday,
  onOpenAddModal,
  onHoverChange, // (dayKey, minutes) => void
  onHoverLeave, // () => void
  onStartResize,
  onRemoveEntry,
}) {
  const totalMin = Math.max(60, dayEndMin - dayStartMin);
  const pxPerMin = HOUR_HEIGHT / 60;

  const hourLines = useMemo(() => {
    const arr = [];
    const startHour = Math.floor(dayStartMin / 60);
    const endHour = Math.ceil(dayEndMin / 60);
    for (let h = startHour; h <= endHour; h++) arr.push(h);
    return arr;
  }, [dayStartMin, dayEndMin]);

  return (
    <main
      style={{
        padding: "28px 36px",
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        overflow: "hidden",
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: 24,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#2a262099",
            }}
          >
            Semaine du{" "}
            {weekStart.toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "long",
            })}
          </div>
          <h2
            className="display"
            style={{
              margin: "4px 0 0 0",
              fontSize: 28,
              fontWeight: 500,
              letterSpacing: "-0.01em",
              textTransform: "capitalize",
            }}
          >
            {fmtMonthYear(weekStart)}
          </h2>
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <button
            className="btn-icon"
            onClick={onPrevWeek}
            aria-label="Semaine précédente"
          >
            <ChevronLeft size={16} />
          </button>
          <button className="btn" onClick={onToday}>
            Aujourd'hui
          </button>
          <button
            className="btn-icon"
            onClick={onNextWeek}
            aria-label="Semaine suivante"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Grille */}
      <div
        style={{
          flex: 1,
          border: "1px solid #2a262020",
          borderRadius: 3,
          background: "rgba(255, 252, 245, 0.5)",
          display: "grid",
          gridTemplateColumns: "60px repeat(5, 1fr)",
          gridTemplateRows: "auto 1fr",
          overflow: "hidden",
          minHeight: 0,
        }}
      >
        {/* Coin haut-gauche vide */}
        <div
          style={{
            borderBottom: "1px solid #2a262020",
            borderRight: "1px solid #2a262020",
          }}
        />

        {/* En-têtes de jours */}
        {days.map((d) => {
          const key = fmtDateKey(d);
          const isToday = key === todayKey;
          const isSelected = key === selectedDay;
          const dayTotal = totalsByDay[key] || 0;
          return (
            <div
              key={key}
              className="day-header"
              onClick={() => onSelectDay(key)}
              style={{
                borderBottom: "1px solid #2a262020",
                borderRight: "1px solid #2a262020",
                padding: "12px 14px",
                background: isSelected
                  ? "rgba(201, 71, 43, 0.06)"
                  : "transparent",
                borderTop: isSelected
                  ? "2px solid #c9472b"
                  : "2px solid transparent",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: "0.15em",
                      color: isToday ? "#c9472b" : "#2a262099",
                      fontWeight: 500,
                    }}
                  >
                    {fmtDayLabel(d)}
                  </div>
                  <div
                    className="display"
                    style={{
                      fontSize: 24,
                      fontWeight: 500,
                      color: isToday ? "#c9472b" : "#2a2620",
                      lineHeight: 1.1,
                      marginTop: 2,
                    }}
                  >
                    {fmtDayNum(d)}
                  </div>
                </div>
                {dayTotal > 0 && (
                  <div className="mono" style={{ fontSize: 10, color: "#2a262080" }}>
                    {fmtDuration(dayTotal)}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Colonne des heures */}
        <div
          style={{
            position: "relative",
            borderRight: "1px solid #2a262020",
            overflowY: "auto",
            gridRow: "2",
          }}
        >
          <div style={{ position: "relative", height: (totalMin / 60) * HOUR_HEIGHT }}>
            {hourLines.map((h) => {
              const top = (h * 60 - dayStartMin) * pxPerMin;
              if (top < 0 || top > totalMin * pxPerMin) return null;
              return (
                <div
                  key={h}
                  className="mono"
                  style={{
                    position: "absolute",
                    top,
                    right: 8,
                    fontSize: 10,
                    color: "#2a262080",
                    transform: "translateY(-50%)",
                  }}
                >
                  {String(h).padStart(2, "0")}:00
                </div>
              );
            })}
          </div>
        </div>

        {/* Colonnes par jour */}
        {days.map((d) => {
          const key = fmtDateKey(d);
          const dayEntries = entriesByDay[key] || [];
          const hoverMinutes =
            hoverPos && hoverPos.dayKey === key && !hoverSuppressed
              ? hoverPos.minutes
              : null;
          return (
            <DayColumn
              key={key}
              dayKey={key}
              isSelected={key === selectedDay}
              entries={dayEntries}
              projects={projects}
              dayStartMin={dayStartMin}
              dayEndMin={dayEndMin}
              totalMin={totalMin}
              pxPerMin={pxPerMin}
              hourLines={hourLines}
              hoverMinutes={hoverMinutes}
              jiraEnabled={jiraEnabled}
              onSelectDay={() => onSelectDay(key)}
              onOpenAddModal={(mins) => onOpenAddModal(key, mins)}
              onHoverChange={(mins) => onHoverChange(key, mins)}
              onHoverLeave={onHoverLeave}
              onStartResize={onStartResize}
              onRemoveEntry={onRemoveEntry}
            />
          );
        })}
      </div>

      {recap.length > 0 && (
        <RecapPanel
          recap={recap}
          days={days}
          todayKey={todayKey}
          totalsByDay={totalsByDay}
          weekTotal={weekTotal}
          projects={projects}
        />
      )}
    </main>
  );
}
