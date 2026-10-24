// The time where another person is, from their phone's time zone (e.g. "Asia/Kolkata").
import { useEffect, useState } from "react";

// "14:20" in that time zone, written the way the interface language writes times.
export function timeIn(tz, lang) {
  try { return new Intl.DateTimeFormat(lang || undefined, { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date()); }
  catch { return ""; }
}

// How far ahead (+) or behind (−) of this phone that time zone is: "+4:30", "−1:00"; "" when it is the same time.
export function offsetFromHere(tz) {
  try {
    const now = new Date();
    const there = new Date(now.toLocaleString("en-US", { timeZone: tz }));
    const here = new Date(now.toLocaleString("en-US"));
    const mins = Math.round((there - here) / 60000 / 15) * 15;
    if (!mins) return "";
    const a = Math.abs(mins);
    return `${mins > 0 ? "+" : "−"}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
  } catch { return ""; }
}

// Re-renders every minute, so a shown time stays right.
export function useMinuteTick() {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);
}
