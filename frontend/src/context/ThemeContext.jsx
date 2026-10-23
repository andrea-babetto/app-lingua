import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext(null);
export const useTheme = () => useContext(ThemeContext);

const KEY = "glott_theme"; // "light" | "dark" | "system" (older versions saved only light or dark)
const systemDark = () => !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => {
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch { /* storage blocked */ }
    return ["light", "dark", "system"].includes(saved) ? saved : "light"; // white by default; the choice is in Profile > Appearance
  });
  const [prefersDark, setPrefersDark] = useState(systemDark);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return undefined;
    const on = () => setPrefersDark(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const theme = mode === "system" ? (prefersDark ? "dark" : "light") : mode; // what is actually shown

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try { localStorage.setItem(KEY, mode); } catch { /* storage blocked */ }
  }, [theme, mode]);

  const toggle = () => setMode(theme === "dark" ? "light" : "dark");
  return <ThemeContext.Provider value={{ theme, mode, setMode, toggle }}>{children}</ThemeContext.Provider>;
}
