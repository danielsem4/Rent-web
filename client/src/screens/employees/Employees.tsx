import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useUsers } from "@/hooks/queries/useUsers";

export default function Employees() {
  const { t } = useTranslation();
  const { data: employees, isLoading, isError } = useUsers();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("employees.title")}</h1>

      {isLoading && (
        <div className="text-muted-foreground flex items-center gap-2 py-10">
          <Loader2 className="size-4 animate-spin" />
          {t("common.loading")}
        </div>
      )}

      {isError && <p className="text-destructive">{t("employees.loadFailed")}</p>}

      {employees && employees.length === 0 && (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center">
            {t("employees.empty")}
          </CardContent>
        </Card>
      )}

      {employees && employees.length > 0 && (
        <Card>
          {/* Container scrolls on narrow screens — the page never overflows sideways. */}
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-start text-sm">
              <thead className="text-muted-foreground border-b">
                <tr>
                  <th className="px-4 py-3 text-start font-medium">{t("employees.name")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("employees.email")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("employees.role")}</th>
                  <th className="px-4 py-3 text-end font-medium">{t("employees.status")}</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="px-4 py-3">{e.name}</td>
                    <td className="px-4 py-3">{e.email}</td>
                    <td className="px-4 py-3">{t(`employees.roles.${e.role}`)}</td>
                    <td className="px-4 py-3 text-end">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                          e.isActive
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {e.isActive
                          ? t("employees.statusActive")
                          : t("employees.statusPending")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
