import { hhmmFromMinutes } from "../lib/date.js";

// Ligne pointillée + badge HH:MM qui suit la souris snappée à 15 min.
// Indique où le clic droit va atterrir. `pointerEvents: none` pour ne rien bloquer.
export default function HoverGuide({ minutes, dayStartMin, pxPerMin }) {
  const top = (minutes - dayStartMin) * pxPerMin;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top,
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
        {hhmmFromMinutes(minutes)}
      </span>
    </div>
  );
}
