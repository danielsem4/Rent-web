import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useThemeStore } from "@/store/useThemeStore";

/**
 * Light/dark toggle. Flips to the opposite of the currently *resolved*
 * appearance, so it behaves sensibly even when the stored preference is
 * "system". Wired to the persisted useThemeStore.
 */
export default function ThemeToggle() {
  const { t } = useTranslation();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={t("theme.toggle")}
      title={isDark ? t("theme.light") : t("theme.dark")}
      className="transition-colors duration-200"
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
