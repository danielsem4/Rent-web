import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en";
import he from "./locales/he";
import ru from "./locales/ru";
import ar from "./locales/ar";

const RTL_LANGUAGES = ["he", "ar"];

const stored = localStorage.getItem("app-language");
const initialLang = stored ? JSON.parse(stored)?.state?.language ?? "en" : "en";

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
