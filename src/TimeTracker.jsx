import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  fmtDateKey,
  hhmmFromMinutes,
  minutesFromHHMM,
  startOfWeek,
} from "./lib/date.js";
import { SNAP_MIN } from "./lib/constants.js";
import { loadState, saveState } from "./lib/storage.js";
import { pushEntryToJira, getPushableEntries } from "./lib/jira.js";
import Sidebar from "./components/Sidebar.jsx";
import Calendar from "./components/Calendar.jsx";
import SettingsModal from "./components/modals/SettingsModal.jsx";
import ProjectModal from "./components/modals/ProjectModal.jsx";
import AddEntryModal from "./components/modals/AddEntryModal.jsx";

export default function TimeTracker() {
  // ----- État principal -----
  const [loaded, setLoaded] = useState(false);
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [selectedDay, setSelectedDay] = useState(fmtDateKey(new Date()));
  const [projects, setProjects] = useState([]);
  const [entries, setEntries] = useState([]);
  const [settings, setSettings] = useState({
    dayStart: "09:00",
    dayEnd: "17:30",
    jira: { enabled: false, baseUrl: "" },
  });

  // ----- État UI -----
  const [showSettings, setShowSettings] = useState(false);
  const [projectModal, setProjectModal] = useState(null); // null | { id?, name, jiraKey }
  const [addModal, setAddModal] = useState(null); // null | { date, projectId, title, jiraKey, start, end }
  const [hoverPos, setHoverPos] = useState(null); // null | { dayKey, minutes }
  const [resizing, setResizing] = useState(null); // null | { id, edge, startY, origStart, origEnd }
  const [pushState, setPushState] = useState(null); // null | { running, total, done }

  // Form rapide de la sidebar
  const [form, setForm] = useState({
    projectId: "",
    title: "",
    start: "09:00",
    end: "10:00",
  });

  // ----- Chargement / persistence -----
  useEffect(() => {
    const s = loadState();
    if (s) {
      if (s.projects) setProjects(s.projects);
      if (s.entries) setEntries(s.entries);
      if (s.settings) {
        // merge pour que les défauts (jira.*) soient présents même sur d'anciennes data
        setSettings((prev) => ({
          ...prev,
          ...s.settings,
          jira: { ...prev.jira, ...(s.settings.jira || {}) },
        }));
      }
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    saveState({ projects, entries, settings });
  }, [projects, entries, settings, loaded]);

  // ----- Dérivés -----
  const days = useMemo(
    () => Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const todayKey = fmtDateKey(new Date());
  const dayStartMin = minutesFromHHMM(settings.dayStart);
  const dayEndMin = minutesFromHHMM(settings.dayEnd);
  const jiraEnabled = !!settings.jira?.enabled;

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

  const weekTotal = useMemo(
    () => days.reduce((acc, d) => acc + (totalsByDay[fmtDateKey(d)] || 0), 0),
    [days, totalsByDay]
  );

  const weekEntriesCount = useMemo(
    () =>
      entries.filter((e) => days.some((d) => fmtDateKey(d) === e.date)).length,
    [entries, days]
  );

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

  const formDuration =
    minutesFromHHMM(form.end) - minutesFromHHMM(form.start);

  // Entrées poussables cette semaine : jiraEnabled + clé effective + pas encore sync.
  const pushableThisWeek = useMemo(() => {
    if (!jiraEnabled) return [];
    const dayKeys = days.map(fmtDateKey);
    return getPushableEntries(entries, projects).filter((e) =>
      dayKeys.includes(e.date)
    );
  }, [entries, projects, days, jiraEnabled]);

  // ----- Handlers : projets -----
  const submitProjectModal = () => {
    if (!projectModal) return;
    const name = projectModal.name.trim();
    if (!name) return;
    const jiraKey = (projectModal.jiraKey || "").trim();

    if (projectModal.id) {
      setProjects((arr) =>
        arr.map((p) =>
          p.id === projectModal.id
            ? { ...p, name, jiraKey: jiraKey || undefined }
            : p
        )
      );
    } else {
      const p = {
        id: `p_${Date.now()}`,
        name,
        ...(jiraKey ? { jiraKey } : {}),
      };
      setProjects((arr) => [...arr, p]);
      if (!form.projectId) setForm((f) => ({ ...f, projectId: p.id }));
    }
    setProjectModal(null);
  };

  const removeProject = (id) => {
    if (!confirm("Supprimer ce projet et toutes ses entrées ?")) return;
    setProjects((arr) => arr.filter((p) => p.id !== id));
    setEntries((arr) => arr.filter((e) => e.projectId !== id));
    if (form.projectId === id) setForm((f) => ({ ...f, projectId: "" }));
  };

  // ----- Handlers : entrées -----
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
    setEntries((arr) => [
      ...arr,
      {
        id: `e_${Date.now()}`,
        projectId: form.projectId,
        date: selectedDay,
        start: form.start,
        end: form.end,
        title: form.title.trim(),
      },
    ]);
    setForm((f) => ({ ...f, title: "" }));
  };

  const removeEntry = (id) => {
    setEntries((arr) => arr.filter((e) => e.id !== id));
  };

  // ----- Handlers : modal d'ajout (clic droit) -----
  const openAddModal = (date, mins) => {
    const startMin = Math.max(
      dayStartMin,
      Math.min(mins, dayEndMin - SNAP_MIN)
    );
    const endMin = Math.min(startMin + 60, dayEndMin);
    const initialProjectId = form.projectId || projects[0]?.id || "";
    const initialJiraKey =
      projects.find((p) => p.id === initialProjectId)?.jiraKey || "";
    setHoverPos(null);
    setAddModal({
      date,
      projectId: initialProjectId,
      title: "",
      jiraKey: initialJiraKey,
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
    const projectDefaultKey =
      projects.find((p) => p.id === addModal.projectId)?.jiraKey || "";
    const typedKey = (addModal.jiraKey || "").trim();
    const overrideKey =
      typedKey && typedKey !== projectDefaultKey ? typedKey : undefined;

    setEntries((arr) => [
      ...arr,
      {
        id: `e_${Date.now()}`,
        projectId: addModal.projectId,
        date: addModal.date,
        start: addModal.start,
        end: addModal.end,
        title: addModal.title.trim(),
        ...(overrideKey ? { jiraKey: overrideKey } : {}),
      },
    ]);
    setAddModal(null);
  };

  // ----- Handlers : resize au drag -----
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
    const pxPerMin = 56 / 60;

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
  }, [resizing, dayStartMin, dayEndMin]);

  // ----- Handler : push batch sur Jira -----
  const pushWeekToJira = async () => {
    if (!jiraEnabled || pushableThisWeek.length === 0) return;
    const proxyUrl = settings.jira?.proxyUrl?.trim();
    if (!proxyUrl) {
      alert("Renseigne d'abord l'URL du proxy dans Réglages.");
      return;
    }
    if (
      !confirm(
        `Pousser ${pushableThisWeek.length} entrée(s) sur Jira ?\nLes worklogs apparaîtront dans ta timeline Jira.`
      )
    )
      return;

    setPushState({ running: true, total: pushableThisWeek.length, done: 0 });

    const results = [];
    for (const entry of pushableThisWeek) {
      const project = projects.find((p) => p.id === entry.projectId);
      // eslint-disable-next-line no-await-in-loop
      const result = await pushEntryToJira({ entry, project, proxyUrl });
      results.push({ entryId: entry.id, ...result });
      setPushState((s) =>
        s ? { ...s, done: s.done + 1 } : null
      );
    }

    const nowISO = new Date().toISOString();
    setEntries((arr) =>
      arr.map((e) => {
        const r = results.find((x) => x.entryId === e.id);
        return r?.ok ? { ...e, syncedAt: nowISO } : e;
      })
    );
    setPushState(null);

    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;
    if (failCount === 0) {
      alert(`✓ ${okCount} entrée(s) poussée(s) sur Jira.`);
    } else {
      const failedDetails = results
        .filter((r) => !r.ok)
        .map((r) => {
          const e = entries.find((x) => x.id === r.entryId);
          return `• ${e?.date} ${e?.start}–${e?.end} → ${r.error}`;
        })
        .join("\n");
      alert(
        `Résultat : ${okCount} OK · ${failCount} échec(s)\n\n${failedDetails}`
      );
    }
  };

  // ----- Handlers : navigation semaine -----
  const goPrevWeek = () => setWeekStart((d) => addDays(d, -7));
  const goNextWeek = () => setWeekStart((d) => addDays(d, 7));
  const goToday = () => {
    const today = new Date();
    setWeekStart(startOfWeek(today));
    setSelectedDay(fmtDateKey(today));
  };

  // ----- Handlers : hover guide -----
  const onHoverChange = (dayKey, minutes) => {
    setHoverPos((prev) => {
      if (prev && prev.dayKey === dayKey && prev.minutes === minutes)
        return prev;
      return { dayKey, minutes };
    });
  };

  // ----- Rendu -----
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
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "320px 1fr",
          minHeight: "100vh",
        }}
      >
        <Sidebar
          projects={projects}
          weekTotal={weekTotal}
          weekEntriesCount={weekEntriesCount}
          selectedDay={selectedDay}
          form={form}
          setForm={setForm}
          formDuration={formDuration}
          dayStart={settings.dayStart}
          dayEnd={settings.dayEnd}
          jiraEnabled={jiraEnabled}
          onAddEntry={addEntry}
          onOpenCreateProject={() =>
            setProjectModal({ name: "", jiraKey: "" })
          }
          onOpenEditProject={(p) =>
            setProjectModal({
              id: p.id,
              name: p.name,
              jiraKey: p.jiraKey || "",
            })
          }
          onRemoveProject={removeProject}
          onOpenSettings={() => setShowSettings(true)}
        />

        <Calendar
          weekStart={weekStart}
          days={days}
          selectedDay={selectedDay}
          todayKey={todayKey}
          projects={projects}
          entriesByDay={entriesByDay}
          totalsByDay={totalsByDay}
          weekTotal={weekTotal}
          recap={recap}
          dayStartMin={dayStartMin}
          dayEndMin={dayEndMin}
          jiraEnabled={jiraEnabled}
          pushableCount={pushableThisWeek.length}
          pushState={pushState}
          onPushWeek={pushWeekToJira}
          hoverPos={hoverPos}
          hoverSuppressed={!!resizing || !!addModal}
          onSelectDay={setSelectedDay}
          onPrevWeek={goPrevWeek}
          onNextWeek={goNextWeek}
          onToday={goToday}
          onOpenAddModal={openAddModal}
          onHoverChange={onHoverChange}
          onHoverLeave={() => setHoverPos(null)}
          onStartResize={startResize}
          onRemoveEntry={removeEntry}
        />
      </div>

      {showSettings && (
        <SettingsModal
          settings={settings}
          setSettings={setSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      <ProjectModal
        state={projectModal}
        setState={setProjectModal}
        jiraEnabled={jiraEnabled}
        onSubmit={submitProjectModal}
        onClose={() => setProjectModal(null)}
      />

      <AddEntryModal
        state={addModal}
        setState={setAddModal}
        projects={projects}
        dayEndMin={dayEndMin}
        jiraEnabled={jiraEnabled}
        onSubmit={submitAddModal}
        onClose={() => setAddModal(null)}
      />
    </div>
  );
}
