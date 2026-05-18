import React, { useState, useEffect, useMemo } from "react";
import { Plus, ChevronLeft, ChevronRight, Trash2, Settings, X } from "lucide-react";

// ---------- Utilitaires date ----------
const startOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // lundi
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const addDays = (date, n) => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
};

const fmtDateKey = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const fmtDayLabel = (d) =>
  d.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "");

const fmtDayNum = (d) => d.getDate();

const fmtMonthYear = (d) =>
  d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

const minutesFromHHMM = (s) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};

const hhmmFromMinutes = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const fmtDuration = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h${String(m).padStart(2, "0")}`;
  if (h) return `${h}h`;
  return `${m}min`;
};

// Durées proposées dans le modal d'ajout (en minutes)
const DURATION_OPTIONS = [15, 30, 45, 60, 75, 90, 120, 150, 180, 240];

// Palette de couleurs pour les projets (assignée automatiquement)
const PROJECT_COLORS = [
  { bg: "#c9472b", soft: "#f4d9d1" }, // terracotta
  { bg: "#2d6a4f", soft: "#cfe3d8" }, // forest
  { bg: "#1d3557", soft: "#cdd6e3" }, // navy
  { bg: "#b8860b", soft: "#efe1c0" }, // gold
  { bg: "#6a4c93", soft: "#dbd0e8" }, // plum
  { bg: "#0e7490", soft: "#c7e0e6" }, // teal
  { bg: "#9a3a3a", soft: "#e9cccc" }, // brick
  { bg: "#4a5568", soft: "#d4d8de" }, // graphite
];

// ---------- Storage helpers ----------
const STORAGE_KEY = "tt:state:v1";

const loadState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const saveState = (state) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Save failed:", e);
  }
};

// ---------- TimePicker (select avec créneaux pré-générés) ----------
function TimePicker({ value, onChange, min = "00:00", max = "23:45", step = 15 }) {
  const options = useMemo(() => {
    const a = minutesFromHHMM(min);
    const b = minutesFromHHMM(max);
    const arr = [];
    for (let m = a; m <= b; m += step) arr.push(hhmmFromMinutes(m));
    if (value && !arr.includes(value)) {
      arr.push(value);
      arr.sort();
    }
    return arr;
  }, [min, max, step, value]);

  return (
    <select
      className="select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}

// ---------- App ----------
export default function TimeTracker() {
  const [loaded, setLoaded] = useState(false);
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [selectedDay, setSelectedDay] = useState(fmtDateKey(new Date()));
  const [projects, setProjects] = useState([]);
  const [entries, setEntries] = useState([]); // {id, projectId, date, start, end, title}
  const [settings, setSettings] = useState({ dayStart: "09:00", dayEnd: "17:30" });
  const [showSettings, setShowSettings] = useState(false);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  // Form state
  const [form, setForm] = useState({
    projectId: "",
    title: "",
    start: "09:00",
    end: "10:00",
  });

  // Resize drag state: { id, edge: "top"|"bottom", startY, origStart, origEnd } | null
  const [resizing, setResizing] = useState(null);

  // Add-entry modal state: { date, projectId, title, start, end } | null
  const [addModal, setAddModal] = useState(null);

  // Position survol pour ligne d'aide (clic droit) : { dayKey, minutes } | null
  const [hoverPos, setHoverPos] = useState(null);

  // ----- Load on mount -----
  useEffect(() => {
    const s = loadState();
    if (s) {
      if (s.projects) setProjects(s.projects);
      if (s.entries) setEntries(s.entries);
      if (s.settings) setSettings(s.settings);
    }
    setLoaded(true);
  }, []);

  // ----- Persist on change -----
  useEffect(() => {
    if (!loaded) return;
    saveState({ projects, entries, settings });
  }, [projects, entries, settings, loaded]);

  // ----- Derived -----
  const days = useMemo(
    () => Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const dayStartMin = minutesFromHHMM(settings.dayStart);
  const dayEndMin = minutesFromHHMM(settings.dayEnd);
  const totalMin = Math.max(60, dayEndMin - dayStartMin);

  // Hauteur d'une heure en px
  const HOUR_HEIGHT = 56;
  const pxPerMin = HOUR_HEIGHT / 60;

  const hourLines = useMemo(() => {
    const arr = [];
    const startHour = Math.floor(dayStartMin / 60);
    const endHour = Math.ceil(dayEndMin / 60);
    for (let h = startHour; h <= endHour; h++) arr.push(h);
    return arr;
  }, [dayStartMin, dayEndMin]);

  const entriesByDay = useMemo(() => {
    const map = {};
    for (const e of entries) {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    }
    return map;
  }, [entries]);

  const totalsByDay = useMemo(() => {
    const map = {};
    for (const e of entries) {
      const d = minutesFromHHMM(e.end) - minutesFromHHMM(e.start);
      map[e.date] = (map[e.date] || 0) + Math.max(0, d);
    }
    return map;
  }, [entries]);

  const weekTotal = useMemo(() => {
    return days.reduce((acc, d) => acc + (totalsByDay[fmtDateKey(d)] || 0), 0);
  }, [days, totalsByDay]);

  // Récap projet × jour (uniquement les projets actifs cette semaine)
  const recap = useMemo(() => {
    const dayKeys = days.map(fmtDateKey);
    return projects
      .map((p) => {
        const perDay = dayKeys.map((k) =>
          entries
            .filter((e) => e.projectId === p.id && e.date === k)
            .reduce(
              (acc, e) =>
                acc +
                Math.max(0, minutesFromHHMM(e.end) - minutesFromHHMM(e.start)),
              0
            )
        );
        const total = perDay.reduce((a, b) => a + b, 0);
        return { project: p, perDay, total };
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [projects, entries, days]);

  const projectColor = (id) => {
    const idx = projects.findIndex((p) => p.id === id);
    return PROJECT_COLORS[idx % PROJECT_COLORS.length] || PROJECT_COLORS[0];
  };

  const projectById = (id) => projects.find((p) => p.id === id);

  // ----- Handlers -----
  const addProject = () => {
    const name = newProjectName.trim();
    if (!name) return;
    const p = { id: `p_${Date.now()}`, name };
    setProjects((arr) => [...arr, p]);
    setNewProjectName("");
    setShowProjectForm(false);
    if (!form.projectId) setForm((f) => ({ ...f, projectId: p.id }));
  };

  const removeProject = (id) => {
    if (!confirm("Supprimer ce projet et toutes ses entrées ?")) return;
    setProjects((arr) => arr.filter((p) => p.id !== id));
    setEntries((arr) => arr.filter((e) => e.projectId !== id));
    if (form.projectId === id) setForm((f) => ({ ...f, projectId: "" }));
  };

  const addEntry = () => {
    if (!form.projectId) {
      alert("Sélectionne d'abord un projet.");
      return;
    }
    const s = minutesFromHHMM(form.start);
    const e = minutesFromHHMM(form.end);
    if (e <= s) {
      alert("L'heure de fin doit être après l'heure de début.");
      return;
    }
    const entry = {
      id: `e_${Date.now()}`,
      projectId: form.projectId,
      date: selectedDay,
      start: form.start,
      end: form.end,
      title: form.title.trim(),
    };
    setEntries((arr) => [...arr, entry]);
    setForm((f) => ({ ...f, title: "" }));
  };

  const removeEntry = (id) => {
    setEntries((arr) => arr.filter((e) => e.id !== id));
  };

  // ----- Resize entries by dragging top/bottom edges -----
  const SNAP_MIN = 15;

  const startResize = (ev, entry, edge) => {
    ev.stopPropagation();
    ev.preventDefault();
    setResizing({
      id: entry.id,
      edge,
      startY: ev.clientY,
      origStart: minutesFromHHMM(entry.start),
      origEnd: minutesFromHHMM(entry.end),
    });
  };

  useEffect(() => {
    if (!resizing) return;

    const onMove = (ev) => {
      const deltaPx = ev.clientY - resizing.startY;
      const deltaMin = Math.round(deltaPx / pxPerMin / SNAP_MIN) * SNAP_MIN;
      setEntries((arr) =>
        arr.map((e) => {
          if (e.id !== resizing.id) return e;
          if (resizing.edge === "top") {
            const newStart = Math.max(
              dayStartMin,
              Math.min(resizing.origStart + deltaMin, resizing.origEnd - SNAP_MIN)
            );
            return { ...e, start: hhmmFromMinutes(newStart) };
          }
          const newEnd = Math.max(
            resizing.origStart + SNAP_MIN,
            Math.min(resizing.origEnd + deltaMin, dayEndMin)
          );
          return { ...e, end: hhmmFromMinutes(newEnd) };
        })
      );
    };
    const onUp = () => setResizing(null);

    document.body.style.userSelect = "none";
    document.body.style.cursor = "ns-resize";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [resizing, pxPerMin, dayStartMin, dayEndMin]);

  // ----- Add-entry modal (déclenché par clic droit sur un jour) -----
  const openAddModal = (date, mins) => {
    const startMin = Math.max(
      dayStartMin,
      Math.min(mins, dayEndMin - SNAP_MIN)
    );
    const endMin = Math.min(startMin + 60, dayEndMin);
    setHoverPos(null);
    setAddModal({
      date,
      projectId: form.projectId || projects[0]?.id || "",
      title: "",
      start: hhmmFromMinutes(startMin),
      end: hhmmFromMinutes(endMin),
    });
  };

  const submitAddModal = () => {
    if (!addModal) return;
    if (!addModal.projectId) {
      alert("Sélectionne un projet.");
      return;
    }
    const s = minutesFromHHMM(addModal.start);
    const e = minutesFromHHMM(addModal.end);
    if (e <= s) {
      alert("L'heure de fin doit être après l'heure de début.");
      return;
    }
    setEntries((arr) => [
      ...arr,
      {
        id: `e_${Date.now()}`,
        projectId: addModal.projectId,
        date: addModal.date,
        start: addModal.start,
        end: addModal.end,
        title: addModal.title.trim(),
      },
    ]);
    setAddModal(null);
  };

  const goPrevWeek = () => setWeekStart((d) => addDays(d, -7));
  const goNextWeek = () => setWeekStart((d) => addDays(d, 7));
  const goToday = () => {
    const today = new Date();
    setWeekStart(startOfWeek(today));
    setSelectedDay(fmtDateKey(today));
  };

  // Layout des entrées qui se chevauchent (colonnes côte-à-côte)
  const layoutEntries = (dayEntries) => {
    const sorted = [...dayEntries].sort(
      (a, b) => minutesFromHHMM(a.start) - minutesFromHHMM(b.start)
    );
    const columns = []; // tableau de tableaux
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
  };

  const todayKey = fmtDateKey(new Date());

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        background:
          "radial-gradient(ellipse at top left, #f5efe6 0%, #ebe3d3 60%, #e3d9c4 100%)",
        fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
        color: "#2a2620",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

        * { box-sizing: border-box; }

        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #c9bfa8; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #a89d83; }

        .display { font-family: 'Fraunces', Georgia, serif; font-feature-settings: "ss01"; }
        .mono { font-family: 'IBM Plex Mono', monospace; }

        .btn {
          border: 1px solid #2a2620;
          background: transparent;
          color: #2a2620;
          padding: 8px 14px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          border-radius: 2px;
          transition: all 0.15s ease;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          letter-spacing: 0.02em;
        }
        .btn:hover { background: #2a2620; color: #f5efe6; }
        .btn-primary {
          background: #2a2620;
          color: #f5efe6;
        }
        .btn-primary:hover { background: #c9472b; border-color: #c9472b; }
        .btn-icon {
          padding: 6px;
          border: 1px solid #2a262030;
          background: transparent;
          cursor: pointer;
          border-radius: 2px;
          color: #2a2620;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
        }
        .btn-icon:hover { background: #2a2620; color: #f5efe6; border-color: #2a2620; }

        .input, .select {
          width: 100%;
          padding: 9px 11px;
          border: 1px solid #2a262040;
          background: rgba(255,255,255,0.5);
          font-family: inherit;
          font-size: 13px;
          color: #2a2620;
          border-radius: 2px;
          transition: border-color 0.15s ease, background 0.15s ease;
        }
        .input:focus, .select:focus {
          outline: none;
          border-color: #c9472b;
          background: rgba(255,255,255,0.85);
        }

        .label {
          display: block;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: #2a262099;
          margin-bottom: 6px;
          font-weight: 500;
        }

        .day-header {
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .day-header:hover { background: rgba(42, 38, 32, 0.04); }

        .entry-block {
          position: absolute;
          border-radius: 3px;
          padding: 6px 8px;
          font-size: 11.5px;
          line-height: 1.3;
          overflow: hidden;
          cursor: default;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
          border-left: 3px solid;
          color: #2a2620;
        }
        .entry-block:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(42, 38, 32, 0.15);
          z-index: 5;
        }
        .entry-block.entry-compact {
          display: flex;
          align-items: center;
          padding: 0 8px;
        }
        .entry-block.entry-inline {
          padding: 4px 8px;
        }
        .entry-block .resize-handle {
          position: absolute;
          left: 0;
          right: 0;
          height: 6px;
          cursor: ns-resize;
          z-index: 6;
        }
        .entry-block .resize-handle.resize-top { top: 0; }
        .entry-block .resize-handle.resize-bottom { bottom: 0; }
        .entry-block:hover .resize-handle { background: rgba(42, 38, 32, 0.18); }

        .entry-block .delete-btn {
          position: absolute;
          top: 4px;
          right: 4px;
          opacity: 0;
          background: rgba(255,255,255,0.7);
          border: none;
          border-radius: 2px;
          padding: 2px;
          cursor: pointer;
          color: #2a2620;
          display: flex;
        }
        .entry-block:hover .delete-btn { opacity: 1; }

        .modal-overlay {
          position: fixed; inset: 0;
          background: rgba(42, 38, 32, 0.4);
          display: flex; align-items: center; justify-content: center;
          z-index: 100;
          backdrop-filter: blur(2px);
        }
        .modal {
          background: #f5efe6;
          padding: 28px;
          border-radius: 4px;
          width: 100%; max-width: 420px;
          border: 1px solid #2a262020;
          box-shadow: 0 20px 60px rgba(42, 38, 32, 0.25);
        }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in { animation: fadeIn 0.3s ease; }
      `}</style>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "320px 1fr",
          minHeight: "100vh",
        }}
      >
        {/* ========== SIDEBAR ========== */}
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
                background:
                  "linear-gradient(to right, #2a2620 0%, #2a262020 100%)",
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
              {entries.filter((e) =>
                days.some((d) => fmtDateKey(d) === e.date)
              ).length}{" "}
              entrées
            </div>
          </div>

          {/* Form d'ajout */}
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
                    min={settings.dayStart}
                    max={settings.dayEnd}
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
                    min={settings.dayStart}
                    max={settings.dayEnd}
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
                durée :{" "}
                {fmtDuration(
                  Math.max(
                    0,
                    minutesFromHHMM(form.end) - minutesFromHHMM(form.start)
                  )
                )}
                {" · "}
                jour :{" "}
                {new Date(selectedDay + "T00:00:00").toLocaleDateString("fr-FR", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </div>

              <button className="btn btn-primary" onClick={addEntry}>
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
                onClick={() => setShowProjectForm(true)}
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
                        style={{
                          flex: 1,
                          fontSize: 13,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p.name}
                      </span>
                      <button
                        onClick={() => removeProject(p.id)}
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
              onClick={() => setShowSettings(true)}
            >
              <Settings size={13} /> Plage horaire
            </button>
          </div>
        </aside>

        {/* ========== CALENDAR ========== */}
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
                Semaine du {weekStart.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
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
              <button className="btn-icon" onClick={goPrevWeek} aria-label="Semaine précédente">
                <ChevronLeft size={16} />
              </button>
              <button className="btn" onClick={goToday}>
                Aujourd'hui
              </button>
              <button className="btn-icon" onClick={goNextWeek} aria-label="Semaine suivante">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Calendar grid */}
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
            {/* Header row */}
            <div
              style={{
                borderBottom: "1px solid #2a262020",
                borderRight: "1px solid #2a262020",
              }}
            />
            {days.map((d) => {
              const key = fmtDateKey(d);
              const isToday = key === todayKey;
              const isSelected = key === selectedDay;
              const dayTotal = totalsByDay[key] || 0;
              return (
                <div
                  key={key}
                  className="day-header"
                  onClick={() => setSelectedDay(key)}
                  style={{
                    borderBottom: "1px solid #2a262020",
                    borderRight: "1px solid #2a262020",
                    padding: "12px 14px",
                    background: isSelected
                      ? "rgba(201, 71, 43, 0.06)"
                      : "transparent",
                    borderTop: isSelected ? "2px solid #c9472b" : "2px solid transparent",
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
                      <div
                        className="mono"
                        style={{ fontSize: 10, color: "#2a262080" }}
                      >
                        {fmtDuration(dayTotal)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Hours column */}
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

            {/* Day columns */}
            {days.map((d) => {
              const key = fmtDateKey(d);
              const dayEntries = entriesByDay[key] || [];
              const { columns, placement } = layoutEntries(dayEntries);
              const isSelected = key === selectedDay;

              return (
                <div
                  key={key}
                  onClick={() => setSelectedDay(key)}
                  style={{
                    position: "relative",
                    borderRight: "1px solid #2a262020",
                    background: isSelected
                      ? "rgba(201, 71, 43, 0.03)"
                      : "transparent",
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
                        dayStartMin +
                        Math.round(y / pxPerMin / SNAP_MIN) * SNAP_MIN;
                      openAddModal(key, mins);
                    }}
                    onMouseMove={(ev) => {
                      if (resizing) return;
                      const rect = ev.currentTarget.getBoundingClientRect();
                      const y = ev.clientY - rect.top;
                      const snapped =
                        dayStartMin +
                        Math.round(y / pxPerMin / SNAP_MIN) * SNAP_MIN;
                      const clamped = Math.max(
                        dayStartMin,
                        Math.min(snapped, dayEndMin)
                      );
                      setHoverPos((prev) => {
                        if (
                          prev &&
                          prev.dayKey === key &&
                          prev.minutes === clamped
                        )
                          return prev;
                        return { dayKey: key, minutes: clamped };
                      });
                    }}
                    onMouseLeave={() => setHoverPos(null)}
                  >
                    {/* Ligne d'aide au survol (indique où le clic droit va atterrir) */}
                    {hoverPos &&
                      hoverPos.dayKey === key &&
                      !resizing &&
                      !addModal && (
                        <div
                          style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            top:
                              (hoverPos.minutes - dayStartMin) * pxPerMin,
                            borderTop: "1px dashed #c9472b",
                            pointerEvents: "none",
                            zIndex: 4,
                          }}
                        >
                          <span
                            className="mono"
                            style={{
                              position: "absolute",
                              left: 4,
                              top: -8,
                              fontSize: 10,
                              color: "#c9472b",
                              background: "#f5efe6",
                              padding: "0 4px",
                              borderRadius: 2,
                              lineHeight: 1.4,
                            }}
                          >
                            {hhmmFromMinutes(hoverPos.minutes)}
                          </span>
                        </div>
                      )}

                    {/* Hour grid lines */}
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

                    {/* Entries */}
                    {dayEntries.map((e) => {
                      const s = minutesFromHHMM(e.start);
                      const en = minutesFromHHMM(e.end);
                      const dur = en - s;
                      const top = Math.max(0, (s - dayStartMin) * pxPerMin);
                      const height = Math.max(18, dur * pxPerMin - 2);
                      const c = projectColor(e.projectId);
                      const proj = projectById(e.projectId);
                      const col = placement.get(e.id) || 0;
                      const widthPct = 100 / columns;
                      const leftPct = col * widthPct;
                      const layoutMode =
                        dur <= 15 ? "compact" : dur < 60 ? "inline" : "full";

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
                          <span style={{ fontWeight: 600, color: c.bg }}>
                            {proj?.name || "—"}
                          </span>
                          {e.title && (
                            <span style={{ opacity: 0.75, marginLeft: 6 }}>
                              · {e.title}
                            </span>
                          )}
                        </div>
                      );

                      const timeLine = (
                        <div
                          className="mono"
                          style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}
                        >
                          {e.start}–{e.end}
                        </div>
                      );

                      return (
                        <div
                          key={e.id}
                          className={`entry-block entry-${layoutMode} fade-in`}
                          style={{
                            top,
                            height,
                            left: `calc(${leftPct}% + 3px)`,
                            width: `calc(${widthPct}% - 6px)`,
                            background: c.soft,
                            borderLeftColor: c.bg,
                          }}
                          onClick={(ev) => ev.stopPropagation()}
                          onContextMenu={(ev) => {
                            ev.preventDefault();
                            ev.stopPropagation();
                          }}
                        >
                          <div
                            className="resize-handle resize-top"
                            onMouseDown={(ev) => startResize(ev, e, "top")}
                            aria-label="Redimensionner début"
                          />
                          <div
                            className="resize-handle resize-bottom"
                            onMouseDown={(ev) => startResize(ev, e, "bottom")}
                            aria-label="Redimensionner fin"
                          />
                          <button
                            className="delete-btn"
                            onClick={() => removeEntry(e.id)}
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
                                  color: c.bg,
                                  marginBottom: 1,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  paddingRight: 16,
                                }}
                              >
                                {proj?.name || "—"}
                              </div>
                              {e.title && (
                                <div
                                  style={{
                                    fontSize: 11,
                                    opacity: 0.85,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {e.title}
                                </div>
                              )}
                              {timeLine}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ========== Récap par projet ========== */}
          {recap.length > 0 && (
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
                  alignItems: "baseline",
                  marginBottom: 12,
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
                <div
                  className="mono"
                  style={{ fontSize: 11, color: "#2a262080" }}
                >
                  {recap.length} projet{recap.length > 1 ? "s" : ""} actif
                  {recap.length > 1 ? "s" : ""}
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(140px, 1.4fr) repeat(5, 1fr) 90px",
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
                  const c = projectColor(project.id);
                  return (
                    <React.Fragment key={project.id}>
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
                          }}
                        />
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontSize: 13,
                          }}
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
                    </React.Fragment>
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
          )}
        </main>
      </div>

      {/* ========== Settings modal ========== */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
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
                Plage horaire
              </h3>
              <button
                className="btn-icon"
                style={{ border: "none" }}
                onClick={() => setShowSettings(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label className="label">Début</label>
                <TimePicker
                  value={settings.dayStart}
                  onChange={(v) => setSettings((s) => ({ ...s, dayStart: v }))}
                  min="00:00"
                  max="23:30"
                  step={30}
                />
              </div>
              <div>
                <label className="label">Fin</label>
                <TimePicker
                  value={settings.dayEnd}
                  onChange={(v) => setSettings((s) => ({ ...s, dayEnd: v }))}
                  min="00:30"
                  max="23:30"
                  step={30}
                />
              </div>
            </div>
            <div
              style={{
                marginTop: 20,
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button className="btn btn-primary" onClick={() => setShowSettings(false)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== Project modal ========== */}
      {showProjectForm && (
        <div className="modal-overlay" onClick={() => setShowProjectForm(false)}>
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
                Nouveau projet
              </h3>
              <button
                className="btn-icon"
                style={{ border: "none" }}
                onClick={() => setShowProjectForm(false)}
              >
                <X size={16} />
              </button>
            </div>
            <label className="label">Nom du projet</label>
            <input
              autoFocus
              className="input"
              placeholder="ex. Refonte API, Onboarding…"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addProject();
              }}
            />
            <div
              style={{
                marginTop: 20,
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button className="btn" onClick={() => setShowProjectForm(false)}>
                Annuler
              </button>
              <button className="btn btn-primary" onClick={addProject}>
                Créer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== Add-entry modal (clic droit) ========== */}
      {addModal && (
        <div className="modal-overlay" onClick={() => setAddModal(null)}>
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
                onClick={() => setAddModal(null)}
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
                {new Date(addModal.date + "T00:00:00").toLocaleDateString(
                  "fr-FR",
                  { weekday: "long", day: "numeric", month: "long" }
                )}
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
                {addModal.start}
                <span style={{ color: "#2a262050", margin: "0 8px" }}>→</span>
                {addModal.end}
                <span
                  className="mono"
                  style={{
                    fontSize: 12,
                    color: "#2a262080",
                    marginLeft: 10,
                    fontWeight: 400,
                  }}
                >
                  {fmtDuration(
                    Math.max(
                      0,
                      minutesFromHHMM(addModal.end) -
                        minutesFromHHMM(addModal.start)
                    )
                  )}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label className="label">Projet</label>
                <select
                  className="select"
                  value={addModal.projectId}
                  onChange={(ev) =>
                    setAddModal((m) => ({ ...m, projectId: ev.target.value }))
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
                <label className="label">Tâche (optionnel)</label>
                <input
                  className="input"
                  autoFocus
                  placeholder="ex. revue PR, daily…"
                  value={addModal.title}
                  onChange={(ev) =>
                    setAddModal((m) => ({ ...m, title: ev.target.value }))
                  }
                />
              </div>

              <div>
                <label className="label">Durée</label>
                <select
                  className="select"
                  value={
                    minutesFromHHMM(addModal.end) -
                    minutesFromHHMM(addModal.start)
                  }
                  onChange={(ev) => {
                    const durMin = Number(ev.target.value);
                    setAddModal((m) => {
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
              <button className="btn" onClick={() => setAddModal(null)}>
                Annuler
              </button>
              <button className="btn btn-primary" onClick={submitAddModal}>
                <Plus size={14} /> Ajouter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
