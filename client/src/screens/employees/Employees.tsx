import { useTranslation } from "react-i18next";
import { ListTable, type ListColumn } from "@/common/components/ListTable";
import { cn } from "@/lib/utils";
import { useUsers } from "@/hooks/queries/useUsers";

type EmployeeRow = NonNullable<ReturnType<typeof useUsers>["data"]>[number];

export default function Employees() {
  const { t } = useTranslation();
  const { data: employees, isLoading, isError } = useUsers();

  const columns: ListColumn<EmployeeRow>[] = [
    { header: t("employees.name"), cell: (e) => <span className="font-medium">{e.name}</span> },
    {
      header: t("employees.email"),
      cell: (e) => <span className="text-muted-foreground">{e.email}</span>,
    },
    { header: t("employees.role"), cell: (e) => t(`employees.roles.${e.role}`) },
    {
      header: t("employees.status"),
      align: "end",
      cell: (e) => (
        <span
          className={cn(
            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
            e.isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          {e.isActive ? t("employees.statusActive") : t("employees.statusPending")}
        </span>
      ),
    },
  ];

  return (
    <ListTable<EmployeeRow>
      title={t("employees.title")}
      subtitle={t("employees.subtitle")}
      data={employees}
      isLoading={isLoading}
      isError={isError}
      errorText={t("employees.loadFailed")}
      emptyText={t("employees.empty")}
      columns={columns}
      rowKey={(e) => e.id}
      searchPlaceholder={t("employees.searchPlaceholder")}
      searchText={(e) => `${e.name} ${e.email} ${t(`employees.roles.${e.role}`)}`}
    />
  );
}
