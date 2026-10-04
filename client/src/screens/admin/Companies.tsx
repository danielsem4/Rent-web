import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { ListTable, type ListColumn } from "@/common/components/ListTable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useCompanies } from "./hooks/queries/useCompanies";
import type { ICompanyListItem } from "@/common/types/company";

export default function Companies() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useCompanies();

  const columns: ListColumn<ICompanyListItem>[] = [
    {
      header: t("admin.colName"),
      cell: (c) => (
        <Link to={`/admin/companies/${c.id}`} className="font-medium text-primary hover:underline">
          {c.name}
        </Link>
      ),
    },
    {
      header: t("admin.colModules"),
      cell: (c) =>
        c.moduleKeys.length === 0 ? (
          <span className="text-muted-foreground">{t("admin.noModules")}</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {c.moduleKeys.map((k) => (
              <Badge key={k} variant="secondary">
                {t(`modules.${k}`)}
              </Badge>
            ))}
          </div>
        ),
    },
    {
      header: t("admin.colManagers"),
      align: "end",
      numeric: true,
      cell: (c) => c.managerCount,
    },
    {
      header: t("admin.colStatus"),
      align: "end",
      cell: (c) => (
        <span
          className={cn(
            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
            c.isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          {c.isActive ? t("admin.statusActive") : t("admin.statusDisabled")}
        </span>
      ),
    },
  ];

  return (
    <ListTable<ICompanyListItem>
      title={t("admin.title")}
      subtitle={t("admin.subtitle")}
      data={data}
      isLoading={isLoading}
      isError={isError}
      errorText={t("admin.loadFailed")}
      emptyText={t("admin.empty")}
      columns={columns}
      rowKey={(c) => c.id}
      searchPlaceholder={t("admin.searchPlaceholder")}
      searchText={(c) => c.name}
      action={
        <Button asChild>
          <Link to="/admin/companies/new">
            <Plus className="size-4" />
            {t("admin.newCompany")}
          </Link>
        </Button>
      }
    />
  );
}
