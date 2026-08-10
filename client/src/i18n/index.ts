import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en";
import he from "./locales/he";
import ru from "./locales/ru";
import ar from "./locales/ar";

const RTL_LANGUAGES = ["he", "ar"];

// Reads the persisted language without ever throwing. The value is normally
// the zustand-persist shape `{ state: { language } }`, but a legacy/other
// writer may have stored a bare code like "en" — JSON.parse would then throw
// during module init and blank the whole app, so guard every path.
function readInitialLang(): string {
  const stored = localStorage.getItem("app-language");
  if (!stored) return "en";
  try {
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed === "string") return parsed;
    if (parsed && typeof parsed === "object") {
      const lang = (parsed as { state?: { language?: string } }).state?.language;
      if (typeof lang === "string") return lang;
    }
  } catch {
    // Not JSON — tolerate a bare language code (e.g. "en").
    if (/^[a-z]{2}$/i.test(stored)) return stored;
  }
  return "en";
}

const initialLang = readInitialLang();

function applyDir(lng: string) {
  const dir = RTL_LANGUAGES.includes(lng) ? "rtl" : "ltr";
  document.documentElement.setAttribute("lang", lng);
  document.documentElement.setAttribute("dir", dir);
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    he: { translation: he },
    ru: { translation: ru },
    ar: { translation: ar },
  },
  lng: initialLang,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

applyDir(initialLang);
i18n.on("languageChanged", applyDir);

export default i18n;
