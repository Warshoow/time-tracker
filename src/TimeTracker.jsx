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
import {
  pushEntryToJira,
  updateJiraWorklog,
  getPushableEntries,
  defaultEntryJiraKey,
  isValidIssueKey,
  fetchWeekWorklogs,
} from "./lib/jira.js";
import Sidebar from "./components/Sidebar.jsx";
import Calendar from "./components/Calendar.jsx";
import SettingsModal from "./components/modals/SettingsModal.jsx";
import ProjectModal from "./components/modals/ProjectModal.jsx";
import AddEntryModal from "./components/modals/AddEntryModal.jsx";
import CreateIssueModal from "./components/modals/CreateIssueModal.jsx";

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
  const [createIssueModal, setCreateIssueModal] = useState(null);
  // null | { jiraProjectKey, issueTypeName, parentKey, summary, description, labels }
  const [remoteWorklogs, setRemoteWorklogs] = useState([]);
  // [{ issueKey, issueSummary, projectKey, worklogs: [{ id, started, timeSpentSeconds, comment }] }]
  const [loadingRemoteWorklogs, setLoadingRemoteWorklogs] = useState(false);

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

  // Fetch des worklogs Jira pour la semaine visible.
  // jiraEnabled est inliné ici car le `const jiraEnabled` est déclaré plus bas
  // dans la fonction (et la dep array serait évaluée avant sa déclaration → TDZ).
  useEffect(() => {
    if (!loaded || !settings.jira?.enabled) {
      setRemoteWorklogs([]);
      return;
    }
    const proxyUrl = settings.jira?.proxyUrl?.trim();
    if (!proxyUrl) {
      setRemoteWorklogs([]);
      return;
    }
    const from = fmtDateKey(weekStart);
    const to = fmtDateKey(addDays(weekStart, 4));
    let cancelled = false;
    setLoadingRemoteWorklogs(true);
    fetchWeekWorklogs({ proxyUrl, from, to }).then((res) => {
      if (cancelled) return;
      if (res.ok) setRemoteWorklogs(res.items || []);
      else {
        console.warn("Fetch worklogs failed:", res.error);
        setRemoteWorklogs([]);
      }
      setLoadingRemoteWorklogs(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loaded, settings.jira?.enabled, settings.jira?.proxyUrl, weekStart]);

  // ----- Dérivés -----
  const days = useMemo(
    () => Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const todayKey = fmtDateKey(new Date());
  const dayStartMin = minutesFromHHMM(settings.dayStart);
  const dayEndMin = minutesFromHHMM(settings.dayEnd);
  const jiraEnabled = !!settings.jira?.enabled;

  // Convertit les worklogs Jira fetched en "entries virtuelles" pour l'affichage.
  // Dédup contre les entrées locales déjà synchronisées (par worklogId d'abord,
  // puis fallback par combo issueKey+date+start pour les entrées poussées avant
  // qu'on stocke le worklogId).
  const remoteEntries = useMemo(() => {
    const localSyncedIds = new Set(
      entries.map((e) => e.jiraWorklogId).filter(Boolean)
    );
    const localSyncedCombos = new Set();
    for (const e of entries) {
      if (!e.syncedAt) continue;
      const project = projects.find((p) => p.id === e.projectId);
      const key = e.jiraKey || project?.jiraKey;
      if (key) localSyncedCombos.add(`${key}|${e.date}|${e.start}`);
    }

    const out = [];
    for (const item of remoteWorklogs) {
      for (const w of item.worklogs) {
        if (localSyncedIds.has(w.id)) continue;
        const started = new Date(w.started);
        const date = fmtDateKey(started);
        const startMin = started.getHours() * 60 + started.getMinutes();
        const start = hhmmFromMinutes(startMin);
        if (localSyncedCombos.has(`${item.issueKey}|${date}|${start}`)) continue;
        const endMin = startMin + Math.floor(w.timeSpentSeconds / 60);
        out.push({
          id: `remote_${w.id}`,
          isRemote: true,
          projectId: null,
          date,
          start,
          end: hhmmFromMinutes(endMin),
          title: w.comment || "",
          jiraKey: item.issueKey,
          jiraSummary: item.issueSummary,
          jiraProjectKey: item.projectKey,
          syncedAt: w.started,
        });
      }
    }
    return out;
  }, [remoteWorklogs, entries, projects]);

  const allEntries = useMemo(
    () => [...entries, ...remoteEntries],
    [entries, remoteEntries]
  );

  const entriesByDay = useMemo(() => {
    const map = {};
    for (const e of allEntries) {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    }
    return map;
  }, [allEntries]);

  const totalsByDay = useMemo(() => {
    const map = {};
    for (const e of allEntries) {
      const d = minutesFromHHMM(e.end) - minutesFromHHMM(e.start);
      map[e.date] = (map[e.date] || 0) + Math.max(0, d);
    }
    return map;
  }, [allEntries]);

  const weekTotal = useMemo(
    () => days.reduce((acc, d) => acc + (totalsByDay[fmtDateKey(d)] || 0), 0),
    [days, totalsByDay]
  );

  const weekEntriesCount = useMemo(
    () =>
      allEntries.filter((e) => days.some((d) => fmtDateKey(d) === e.date)).length,
    [allEntries, days]
  );

  const recap = useMemo(() => {
    const dayKeys = days.map(fmtDateKey);

    // Index des entrées remote par jiraProjectKey pour matcher avec les projets tracker
    const remotesByJiraKey = new Map();
    for (const r of remoteEntries) {
      const k = r.jiraProjectKey;
      if (!k) continue;
      if (!remotesByJiraKey.has(k)) remotesByJiraKey.set(k, []);
      remotesByJiraKey.get(k).push(r);
    }
    const claimedJiraKeys = new Set();

    const durationOf = (e) =>
      Math.max(0, minutesFromHHMM(e.end) - minutesFromHHMM(e.start));

    // Lignes pour les projets tracker — combinent local + remote du même espace Jira
    const rows = projects.map((p) => {
      if (p.jiraProjectKey) claimedJiraKeys.add(p.jiraProjectKey);
      const matchingRemotes = p.jiraProjectKey
        ? remotesByJiraKey.get(p.jiraProjectKey) || []
        : [];
      const perDay = dayKeys.map((k) => {
        const local = entries
          .filter((e) => e.projectId === p.id && e.date === k)
          .reduce((acc, e) => acc + durationOf(e), 0);
        const remote = matchingRemotes
          .filter((e) => e.date === k)
          .reduce((acc, e) => acc + durationOf(e), 0);
        return local + remote;
      });
      return { project: p, perDay, total: perDay.reduce((a, b) => a + b, 0) };
    });

    // Lignes synthétiques pour les espaces Jira dont aucun projet tracker n'est mappé.
    // On les affiche quand même pour que le temps remonte dans le récap.
    for (const [jiraKey, items] of remotesByJiraKey) {
      if (claimedJiraKeys.has(jiraKey)) continue;
      const perDay = dayKeys.map((k) =>
        items.filter((e) => e.date === k).reduce((acc, e) => acc + durationOf(e), 0)
      );
      const total = perDay.reduce((a, b) => a + b, 0);
      if (total === 0) continue;
      rows.push({
        project: {
          id: `__jira_${jiraKey}`,
          name: `Jira · ${jiraKey}`,
          isRemoteGroup: true,
        },
        perDay,
        total,
      });
    }

    return rows.filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
  }, [projects, entries, remoteEntries, days]);

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
    const jiraProjectKey = (projectModal.jiraProjectKey || "").trim();
    const jiraProjectName = (projectModal.jiraProjectName || "").trim();

    const patch = {
      name,
      jiraKey: jiraKey || undefined,
      jiraProjectKey: jiraProjectKey || undefined,
      jiraProjectName: jiraProjectName || undefined,
    };

    if (projectModal.id) {
      setProjects((arr) =>
        arr.map((p) => (p.id === projectModal.id ? { ...p, ...patch } : p))
      );
    } else {
      const p = { id: `p_${Date.now()}`, ...patch };
      // Nettoyage des undefined pour ne pas polluer le localStorage
      Object.keys(p).forEach((k) => p[k] === undefined && delete p[k]);
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

  // Auto-push d'une entrée vers Jira après création (si éligible).
  // Async fire-and-forget : on n'attend pas dans le caller pour ne pas geler l'UI.
  // En cas d'échec, alerte simple ; en cas de succès, on patch syncedAt + jiraWorklogId.
  const maybePushEntry = async (entry) => {
    const proxyUrl = settings.jira?.proxyUrl?.trim();
    if (!jiraEnabled || !proxyUrl) return;
    const project = projects.find((p) => p.id === entry.projectId);
    const effectiveKey = entry.jiraKey || project?.jiraKey || "";
    if (!isValidIssueKey(effectiveKey)) return;

    const result = await pushEntryToJira({ entry, project, proxyUrl });
    if (result.ok) {
      setEntries((arr) =>
        arr.map((e) =>
          e.id === entry.id
            ? {
                ...e,
                syncedAt: new Date().toISOString(),
                ...(result.worklogId
                  ? { jiraWorklogId: result.worklogId }
                  : {}),
              }
            : e
        )
      );
    } else {
      alert(
        `Entrée ajoutée localement mais le push Jira a échoué :\n${result.error}\n\nTu pourras retenter via "Pousser N sur Jira".`
      );
    }
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
    maybePushEntry(entry);
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
    const initialProject = projects.find((p) => p.id === initialProjectId);
    const initialJiraKey = defaultEntryJiraKey(initialProject);
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
    const project = projects.find((p) => p.id === addModal.projectId);
    const projectDefaultKey = defaultEntryJiraKey(project);
    const typedKey = (addModal.jiraKey || "").trim();
    // On stocke sur l'entrée seulement si la clé saisie diffère du défaut du projet
    // (qui peut être soit une issue explicite, soit un préfixe "{ESPACE}-").
    const overrideKey =
      typedKey && typedKey !== projectDefaultKey ? typedKey : undefined;

    const newEntry = {
      id: `e_${Date.now()}`,
      projectId: addModal.projectId,
      date: addModal.date,
      start: addModal.start,
      end: addModal.end,
      title: addModal.title.trim(),
      ...(overrideKey ? { jiraKey: overrideKey } : {}),
    };
    setEntries((arr) => [...arr, newEntry]);
    setAddModal(null);
    maybePushEntry(newEntry);
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
          // Si déjà synced, marquer comme modifiée pour que le bouton de batch
          // l'inclue dans la prochaine sync (en mode PUT).
          const dirtyFlag = e.syncedAt ? { dirtySinceSync: true } : {};
          if (resizing.edge === "top") {
            const newStart = Math.max(
              dayStartMin,
              Math.min(resizing.origStart + deltaMin, resizing.origEnd - SNAP_MIN)
            );
            return {
              ...e,
              start: hhmmFromMinutes(newStart),
              ...dirtyFlag,
            };
          }
          const newEnd = Math.max(
            resizing.origStart + SNAP_MIN,
            Math.min(resizing.origEnd + deltaMin, dayEndMin)
          );
          return {
            ...e,
            end: hhmmFromMinutes(newEnd),
            ...dirtyFlag,
          };
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
      // PUT (update) si déjà sync avec un worklogId connu, sinon POST (create)
      const isUpdate = !!(entry.syncedAt && entry.jiraWorklogId);
      // eslint-disable-next-line no-await-in-loop
      const result = isUpdate
        ? await updateJiraWorklog({
            entry,
            project,
            proxyUrl,
            worklogId: entry.jiraWorklogId,
          })
        : await pushEntryToJira({ entry, project, proxyUrl });
      results.push({ entryId: entry.id, isUpdate, ...result });
      setPushState((s) =>
        s ? { ...s, done: s.done + 1 } : null
      );
    }

    const nowISO = new Date().toISOString();
    setEntries((arr) =>
      arr.map((e) => {
        const r = results.find((x) => x.entryId === e.id);
        if (!r?.ok) return e;
        // dirtySinceSync est explicitement effacé via undefined (sera retiré
        // de l'objet sauvé en localStorage grâce à JSON.stringify).
        return {
          ...e,
          syncedAt: nowISO,
          dirtySinceSync: undefined,
          ...(r.worklogId ? { jiraWorklogId: r.worklogId } : {}),
        };
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
            setProjectModal({
              name: "",
              jiraKey: "",
              jiraProjectKey: "",
              jiraProjectName: "",
            })
          }
          onOpenEditProject={(p) =>
            setProjectModal({
              id: p.id,
              name: p.name,
              jiraKey: p.jiraKey || "",
              jiraProjectKey: p.jiraProjectKey || "",
              jiraProjectName: p.jiraProjectName || "",
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
          jiraBaseUrl={settings.jira?.baseUrl || ""}
          pushableCount={pushableThisWeek.length}
          pushState={pushState}
          loadingRemoteWorklogs={loadingRemoteWorklogs}
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
        proxyUrl={settings.jira?.proxyUrl || ""}
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
        onOpenCreateIssue={(prefill) =>
          setCreateIssueModal({
            jiraProjectKey: prefill?.jiraProjectKey || "",
            issueTypeId: "",
            issueTypeName: "",
            parentKey: "",
            summary: prefill?.summary || "",
            description: "",
            labels: "",
            linkToStoryKey: "",
            linkTypeName: "",
            sprintId: "",
          })
        }
      />

      {/* CreateIssueModal en dernier pour passer au-dessus de l'AddEntryModal.
          Toujours ouvert depuis AddEntryModal, donc on injecte direct la clé créée
          dans l'entrée en cours d'édition. */}
      <CreateIssueModal
        state={createIssueModal}
        setState={setCreateIssueModal}
        proxyUrl={settings.jira?.proxyUrl || ""}
        onClose={() => setCreateIssueModal(null)}
        onCreated={(newKey) =>
          setAddModal((m) => (m ? { ...m, jiraKey: newKey } : m))
        }
      />
    </div>
  );
}
