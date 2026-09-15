import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, Shield, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useThemeStore } from "@/store/useThemeStore";
import { useLanguageStore } from "@/store/useLanguageStore";
import type { Language } from "@/store/useLanguageStore";
import { useAuthStore } from "@/store/useAuthStore";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/common/components/StatusBadge";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark" | "system";

const THEMES: { value: Theme; labelKey: string }[] = [
  { value: "light", labelKey: "settings.themeLight" },
  { value: "dark", labelKey: "settings.themeDark" },
  { value: "system", labelKey: "settings.themeSystem" },
];

// Native language names — shown the same way in every locale so users can
// always recognise their own language.
const LANGUAGES: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "he", label: "עברית" },
  { value: "ar", label: "العربية" },
  { value: "ru", label: "Русский" },
];

/** Initials from a display name (first + last word), for the avatar placeholder. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Section wrapper: uppercase muted heading + divider, matching the design. */
function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {title}
        </h2>
        <div className="border-b border-border" />
      </div>
      {children}
    </section>
  );
}

/** Icon + label + value row inside the profile grid. */
function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="flex flex-col items-start gap-1.5">
        <span className="text-sm text-muted-foreground">{label}</span>
        {children}
      </div>
    </div>
  );
}

/** Fixed-appearance "Aa" swatch previewing each theme (does not follow the
 * active theme — it always represents the option it stands for). */
function ThemeSwatch({ value }: { value: Theme }) {
  const base =
    "flex h-14 w-full items-center justify-center overflow-hidden rounded-md border text-base font-semibold";
  if (value === "light") {
    return <div className={cn(base, "bg-white text-slate-900")}>Aa</div>;
  }
  if (value === "dark") {
    return (
      <div className={cn(base, "border-slate-800 bg-slate-900 text-white")}>
        Aa
      </div>
    );
  }
  // system — split half dark / half light
  return (
    <div className={cn(base, "relative border-slate-300 p-0")}>
      <div className="flex h-full w-1/2 items-center justify-center bg-slate-900 text-white">
        Aa
      </div>
      <div className="flex h-full w-1/2 items-center justify-center bg-white text-slate-900">
        Aa
      </div>
    </div>
  );
}

/** A selectable theme card with an "Aa" preview and label. */
function ThemeCard({
  value,
  label,
  selected,
  onSelect,
}: {
  value: Theme;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "relative flex flex-col items-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        selected
          ? "border-primary bg-accent ring-2 ring-primary"
          : "border-border hover:bg-accent/50",
      )}
    >
      {selected && (
        <Check className="absolute end-2 top-2 size-4 text-primary" />
      )}
      <ThemeSwatch value={value} />
      <span>{label}</span>
    </button>
  );
}

export default function Settings() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <h1 className="text-2xl font-semibold">{t("settings.title")}</h1>

      {user && (
        <SettingsSection title={t("settings.profile")}>
          <Card>
            <CardContent className="flex flex-col gap-6">
              <div className="flex items-center gap-4">
                <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                  {initials(user.name)}
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-lg font-semibold">
                    {user.name}
                  </span>
                  <span className="truncate text-sm text-muted-foreground">
                    {user.email}
                  </span>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <InfoRow icon={Shield} label={t("settings.role")}>
                  <StatusBadge tone="info">
                    {t(`employees.roles.${user.role}`)}
                  </StatusBadge>
                </InfoRow>
                <InfoRow icon={ShieldCheck} label={t("settings.accountStatus")}>
                  <StatusBadge tone="success">
                    {t("settings.statusActive")}
                  </StatusBadge>
                </InfoRow>
              </div>
            </CardContent>
          </Card>
        </SettingsSection>
      )}

      <SettingsSection title={t("settings.appearance")}>
        <div className="grid grid-cols-3 gap-3">
          {THEMES.map((item) => (
            <ThemeCard
              key={item.value}
              value={item.value}
              label={t(item.labelKey)}
              selected={theme === item.value}
              onSelect={() => setTheme(item.value)}
            />
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title={t("settings.languageLabel")}>
        <Select
          value={language}
          onValueChange={(v) => setLanguage(v as Language)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((lang) => (
              <SelectItem key={lang.value} value={lang.value}>
                {lang.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsSection>
    </div>
  );
}
