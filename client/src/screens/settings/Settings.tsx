import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { Check, Moon, Monitor, Sun } from "lucide-react";
import { useThemeStore } from "@/store/useThemeStore";
import { useLanguageStore } from "@/store/useLanguageStore";
import type { Language } from "@/store/useLanguageStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark" | "system";

const THEMES: { value: Theme; labelKey: string; icon: ComponentType<{ className?: string }> }[] =
  [
    { value: "light", labelKey: "settings.themeLight", icon: Sun },
    { value: "dark", labelKey: "settings.themeDark", icon: Moon },
    { value: "system", labelKey: "settings.themeSystem", icon: Monitor },
  ];

// Native language names — shown the same way in every locale so users can
// always recognise their own language.
const LANGUAGES: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "he", label: "עברית" },
  { value: "ar", label: "العربية" },
  { value: "ru", label: "Русский" },
];

/** A single selectable option rendered as a highlightable card. */
function OptionCard({
  selected,
  label,
  icon: Icon,
  onSelect,
}: {
  selected: boolean;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "relative flex flex-col items-center justify-center gap-2 rounded-lg border p-4 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        selected
          ? "border-primary bg-accent ring-2 ring-primary"
          : "border-border hover:bg-accent/50",
      )}
    >
      {selected && (
        <Check className="absolute end-2 top-2 size-4 text-primary" />
      )}
      {Icon && <Icon className="size-6" />}
      <span>{label}</span>
    </button>
  );
}

export default function Settings() {
  const { t } = useTranslation();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("settings.title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.appearance")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <span className="text-sm font-medium text-muted-foreground">
              {t("settings.themeLabel")}
            </span>
            <div className="grid grid-cols-3 gap-3">
              {THEMES.map((item) => (
                <OptionCard
                  key={item.value}
                  selected={theme === item.value}
                  label={t(item.labelKey)}
                  icon={item.icon}
                  onSelect={() => setTheme(item.value)}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <span className="text-sm font-medium text-muted-foreground">
              {t("settings.languageLabel")}
            </span>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {LANGUAGES.map((lang) => (
                <OptionCard
                  key={lang.value}
                  selected={language === lang.value}
                  label={lang.label}
                  onSelect={() => setLanguage(lang.value)}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
