import { useRouteError } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export default function RouteError() {
  const { t } = useTranslation();
  const error = useRouteError();
  const message =
    error instanceof Error ? error.message : String(error ?? "");

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-muted p-4 text-center">
      <h1 className="text-2xl font-semibold">{t("error.title")}</h1>
      {message && (
        <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      )}
      <Button onClick={() => (window.location.href = "/login")}>
        {t("error.retry")}
      </Button>
    </div>
  );
}
