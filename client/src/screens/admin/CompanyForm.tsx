import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
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
import { MODULES, type ModuleKey } from "@/common/types/module";
import { cn } from "@/lib/utils";
import { useCreateCompany } from "./hooks/queries/useCompanies";

export default function CompanyForm() {
  const { t } = useTranslation();
  const create = useCreateCompany();

  const [name, setName] = useState("");
  const [modules, setModules] = useState<Set<ModuleKey>>(new Set());
  const [addManager, setAddManager] = useState(false);
  const [managerName, setManagerName] = useState("");
  const [managerEmail, setManagerEmail] = useState("");

  const toggle = (key: ModuleKey) =>
    setModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const canSubmit = name.trim().length > 0 && (!addManager || (managerName.trim() && managerEmail.trim()));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || create.isPending) return;
    create.mutate({
      name: name.trim(),
      modules: [...modules],
      ...(addManager
        ? { manager: { name: managerName.trim(), email: managerEmail.trim() } }
        : {}),
    });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ms-2">
          <Link to="/admin/companies">
            <ArrowLeft className="size-4" />
            {t("admin.back")}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">{t("admin.newCompany")}</h1>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.companyDetails")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t("admin.name")}</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("admin.modules")}</CardTitle>
            <CardDescription>{t("admin.modulesHint")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {MODULES.map((m) => {
              const on = modules.has(m.key);
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("admin.firstManager")}</CardTitle>
            <CardDescription>{t("admin.firstManagerHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={addManager}
                onChange={(e) => setAddManager(e.target.checked)}
                className="size-4"
              />
              {t("admin.addFirstManager")}
            </label>
            {addManager && (
              <div className="grid gap-4 sm:grid-cols-2">
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
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button asChild variant="outline">
            <Link to="/admin/companies">{t("admin.cancel")}</Link>
          </Button>
          <Button type="submit" disabled={!canSubmit || create.isPending}>
            {t("admin.create")}
          </Button>
        </div>
      </form>
    </div>
  );
}
