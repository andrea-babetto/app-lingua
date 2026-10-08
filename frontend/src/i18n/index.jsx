import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { LANGUAGES, isRTL, langByCode } from "@/data/languages";

// The English sentence is the key. A language file maps it to its translation; anything missing stays in English.
const loaders = import.meta.glob("./locales/*.json");
const KEY = "glott_ui_lang";
const supported = new Set(LANGUAGES.map((l) => l.code));

const stored = () => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } };
const browser = () => (typeof navigator !== "undefined" ? (navigator.language || "en").slice(0, 2).toLowerCase() : "en");

export function pickLanguage(userLang) {
  for (const c of [userLang, stored(), browser()]) if (c && supported.has(c)) return c;
  return "en";
}

export function format(text, vars) {
  return vars ? text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : text;
}

const I18nContext = createContext({ t: format, lang: "en", langName: (c) => langByCode(c).name, setUiLang: () => {} });
export const useI18n = () => useContext(I18nContext);

export function I18nProvider({ children }) {
  const { user } = useAuth();
  const [override, setOverride] = useState("");  // chosen on the sign-in page, before there is an account
  const lang = user?.language && supported.has(user.language) ? user.language : pickLanguage(override);
  const [dict, setDict] = useState({});

  useEffect(() => {
    let live = true;
    const load = loaders[`./locales/${lang}.json`];
    if (lang === "en" || !load) { setDict({}); return undefined; }
    load().then((m) => { if (live) setDict(m.default || m); }).catch(() => { if (live) setDict({}); });
    return () => { live = false; };
  }, [lang]);

  useEffect(() => {
    try { if (user?.language) localStorage.setItem(KEY, user.language); } catch { /* storage blocked */ }
  }, [user?.language]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = isRTL(lang) ? "rtl" : "ltr";
  }, [lang]);

  const t = useCallback((text, vars) => format(dict[text] ?? text, vars), [dict]);
  const langName = useCallback((code) => (lang === "en" ? langByCode(code).name : langByCode(code).native), [lang]);
  const setUiLang = useCallback((c) => {
    try { localStorage.setItem(KEY, c); } catch { /* storage blocked */ }
    setOverride(c);
  }, []);
  const value = useMemo(() => ({ t, lang, langName, setUiLang }), [t, lang, langName, setUiLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
