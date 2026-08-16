import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { translations } from "./translations";

const STORAGE_KEY = "research.lang";
const I18nContext = createContext(null);

function readSavedLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "zh" || saved === "en" ? saved : "zh";
  } catch {
    return "zh";
  }
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(readSavedLang);

  const setLang = useCallback((next) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable — session-only */
    }
  }, []);

  const t = useCallback(
    (key, params) => {
      const dict = translations[lang] || translations.en;
      const template = dict[key] ?? translations.en[key] ?? key;
      if (!params) return template;
      return String(template).replace(/\{(\w+)\}/g, (m, name) =>
        params[name] !== undefined ? String(params[name]) : m
      );
    },
    [lang]
  );

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    document.title = translations[lang]?.["app.title"] || translations.en["app.title"];
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
