import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Eye, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ListTable, type ListColumn } from "@/common/components/ListTable";
import { useAuthStore } from "@/store/useAuthStore";
import { ROLES } from "@/common/types/role";
import { useProperties } from "./hooks/queries/useProperties";
import { useDeleteProperty } from "./hooks/queries/usePropertyMutations";
import { OccupancyChip } from "./components/Occupancy";

type PropertyRow = NonNullable<ReturnType<typeof useProperties>["data"]>[number];

export default function Properties() {
  const { t, i18n } = useTranslation();
  const { data: properties, isLoading, isError } = useProperties();
  const remove = useDeleteProperty();
  // UX-only gating — the server is the enforcement point (workers get 403 on writes).
  const role = useAuthStore((s) => s.user?.role);
  const canWrite = role === ROLES.COMPANY_MANAGER;

  const columns: ListColumn<PropertyRow>[] = [
    { header: t("properties.city"), cell: (p) => <span className="font-medium">{p.city}</span> },
    {
      header: t("properties.address"),
      cell: (p) => <span className="text-muted-foreground">{p.address}</span>,
    },
    { header: t("properties.owner"), cell: (p) => p.ownerName ?? "—" },
    {
      header: t("properties.rent"),
      align: "end",
      numeric: true,
      cell: (p) => p.monthlyRent.toLocaleString(i18n.language),
    },
    {
      header: t("properties.occupancy"),
      align: "end",
      cell: (p) => <OccupancyChip total={p.total} maxCapacity={p.maxCapacity} />,
    },
    {
      header: t("properties.actions"),
      align: "end",
      cell: (p) => (
        <div className="flex justify-end gap-2">
          <Button asChild variant="outline" size="icon" aria-label={t("properties.view")}>
            <Link to={`/properties/${p.id}`}>
              <Eye className="size-4" />
            </Link>
          </Button>
          {canWrite && (
            <>
              <Button asChild variant="outline" size="icon" aria-label={t("properties.edit")}>
                <Link to={`/properties/${p.id}/edit`}>
                  <Pencil className="size-4" />
                </Link>
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={t("properties.delete")}
                    disabled={remove.isPending}
                  >
                    <Trash2 className="text-destructive size-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("properties.delete")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("properties.confirmDelete", { label: `${p.city}, ${p.address}` })}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("properties.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={() => remove.mutate(p.id)}
                    >
                      {t("properties.delete")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <ListTable<PropertyRow>
      title={t("properties.title")}
      subtitle={t("properties.subtitle")}
      data={properties}
      isLoading={isLoading}
      isError={isError}
      errorText={t("properties.loadFailed")}
      emptyText={t("properties.empty")}
      columns={columns}
      rowKey={(p) => p.id}
      searchPlaceholder={t("properties.searchPlaceholder")}
      searchText={(p) => `${p.city} ${p.address} ${p.ownerName ?? ""}`}
      action={
        canWrite && (
          <Button asChild className="rounded-lg">
            <Link to="/properties/new">
              <Plus className="size-4" />
              {t("properties.add")}
            </Link>
          </Button>
        )
      }
    />
  );
}
