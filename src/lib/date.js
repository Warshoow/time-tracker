// ---------- Dates ----------

export const startOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // lundi
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const addDays = (date, n) => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
};

export const fmtDateKey = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const fmtDayLabel = (d) =>
  d.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "");

export const fmtDayNum = (d) => d.getDate();

export const fmtMonthYear = (d) =>
  d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

// ---------- Heures ----------

export const minutesFromHHMM = (s) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};

export const hhmmFromMinutes = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

export const fmtDuration = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h${String(m).padStart(2, "0")}`;
  if (h) return `${h}h`;
  return `${m}min`;
};
