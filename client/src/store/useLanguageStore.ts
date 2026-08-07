import { create } from "zustand";
import { persist } from "zustand/middleware";
import i18n from "@/i18n";

export type Language = "en" | "he" | "ru" | "ar";

interface LanguageState {
  language: Language;
  setLanguage: (language: Language) => void;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: "en",
      setLanguage: (language) => {
        void i18n.changeLanguage(language);
        set({ language });
      },
    }),
    {
      name: "app-language",
    },
  ),
);
