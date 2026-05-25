import { useMemo } from "react";
import { hhmmFromMinutes, minutesFromHHMM } from "../lib/date.js";

// <select> avec créneaux pré-générés. Remplace <input type="time"> (spinners
// natifs Windows pénibles). Si la value courante n'est pas alignée sur le step,
// elle est insérée dans la liste pour rester sélectionnable.
export default function TimePicker({
  value,
  onChange,
  min = "00:00",
  max = "23:45",
  step = 15,
}) {
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
