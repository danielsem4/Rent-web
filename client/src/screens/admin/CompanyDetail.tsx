import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { MODULES, type ModuleKey } from "@/common/types/module";
import {
  useCompany,
  useCreateManager,
  useSetCompanyModules,
  useUpdateCompany,
} from "./hooks/queries/useCompanies";

export default function CompanyDetail() {
  const { t } = useTranslation();
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const { data: company, isLoading, isError } = useCompany(Number.isInteger(id) ? id : undefined);

  const setModules = useSetCompanyModules(id);
  const updateCompany = useUpdateCompany(id);
  const createManager = useCreateManager(id);

  const [selected, setSelected] = useState<Set<ModuleKey>>(new Set());
  const [managerName, setManagerName] = useState("");
  const [managerEmail, setManagerEmail] = useState("");

  // Sync local toggle state when the company loads/refetches.
  useEffect(() => {
    if (company) setSelected(new Set(company.moduleKeys as ModuleKey[]));
  }, [company]);

  if (isLoading) {
    return <p className="text-muted-foreground">{t("common.loading")}</p>;
  }
  if (isError || !company) {
    return <p className="text-destructive">{t("admin.loadFailed")}</p>;
  }

  const toggle = (key: ModuleKey) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const addManager = (e: React.FormEvent) => {
    e.preventDefault();
    if (!managerName.trim() || !managerEmail.trim() || createManager.isPending) return;
    createManager.mutate(
      { name: managerName.trim(), email: managerEmail.trim() },
      {
        onSuccess: () => {
          setManagerName("");
          setManagerEmail("");
        },
      },
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ms-2">
          <Link to="/admin/companies">
            <ArrowLeft className="size-4" />
            {t("admin.back")}
          </Link>
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">{company.name}</h1>
          <Button
            variant={company.isActive ? "outline" : "default"}
            onClick={() => updateCompany.mutate({ isActive: !company.isActive })}
            disabled={updateCompany.isPending}
          >
            {company.isActive ? t("admin.disableCompany") : t("admin.enableCompany")}
          </Button>
        </div>
        {!company.isActive && (
          <p className="mt-1 text-sm text-destructive">{t("admin.disabledNotice")}</p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.modules")}</CardTitle>
          <CardDescription>{t("admin.modulesHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {MODULES.map((m) => {
              const on = selected.has(m.key);
              return (
                <button
                  type="button"
                  key={m.key}
                  onClick={() => toggle(m.key)}
                  aria-pressed={on}
                  className={cn(
                    "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-input text-muted-foreground hover:bg-foreground/5",
                  )}
                >
                  {t(m.labelKey)}
                </button>
              );
            })}
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => setModules.mutate([...selected])}
              disabled={setModules.isPending}
            >
              {t("admin.saveModules")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.managers")}</CardTitle>
          <CardDescription>{t("admin.managersHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {company.managers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("admin.noManagers")}</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {company.managers.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{m.email}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                      m.isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {m.isActive ? t("admin.statusActive") : t("admin.statusPending")}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={addManager} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="mname">{t("admin.managerName")}</Label>
              <Input id="mname" value={managerName} onChange={(e) => setManagerName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="memail">{t("admin.managerEmail")}</Label>
              <Input
                id="memail"
                type="email"
                value={managerEmail}
                onChange={(e) => setManagerEmail(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              disabled={!managerName.trim() || !managerEmail.trim() || createManager.isPending}
            >
              {t("admin.inviteManager")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
