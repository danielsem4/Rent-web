import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuthStore } from "@/store/useAuthStore";
import { ROLES } from "@/common/types/role";
import { useProperties } from "./hooks/queries/useProperties";
import { useDeleteProperty } from "./hooks/queries/usePropertyMutations";

export default function Properties() {
  const { t } = useTranslation();
  const { data: properties, isLoading, isError } = useProperties();
  const remove = useDeleteProperty();
  // UX-only gating — the server is the enforcement point (workers get 403 on writes).
  const role = useAuthStore((s) => s.user?.role);
  const canWrite = role === ROLES.COMPANY_MANAGER;

  const onDelete = (id: number, label: string) => {
    if (window.confirm(t("properties.confirmDelete", { label }))) remove.mutate(id);
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("properties.title")}</h1>
        {canWrite && (
          <Button asChild className="rounded-full">
            <Link to="/properties/new">
              <Plus className="size-4" />
              {t("properties.add")}
            </Link>
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="text-muted-foreground flex items-center gap-2 py-10">
          <Loader2 className="size-4 animate-spin" />
          {t("common.loading")}
        </div>
      )}

      {isError && <p className="text-destructive">{t("properties.loadFailed")}</p>}

      {properties && properties.length === 0 && (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center">
            {t("properties.empty")}
          </CardContent>
        </Card>
      )}

      {properties && properties.length > 0 && (
        <Card>
          {/* Container scrolls on narrow screens — the page never overflows sideways. */}
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-start text-sm">
              <thead className="text-muted-foreground border-b">
                <tr>
                  <th className="px-4 py-3 text-start font-medium">{t("properties.city")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("properties.address")}</th>
                  <th className="px-4 py-3 text-start font-medium">{t("properties.owner")}</th>
                  <th className="px-4 py-3 text-end font-medium">{t("properties.rent")}</th>
                  <th className="px-4 py-3 text-end font-medium">{t("properties.capacity")}</th>
                  {canWrite && <th className="px-4 py-3 text-end font-medium">{t("properties.actions")}</th>}
                </tr>
              </thead>
              <tbody>
                {properties.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-4 py-3">{p.city}</td>
                    <td className="px-4 py-3">{p.address}</td>
                    <td className="px-4 py-3">{p.ownerName ?? "—"}</td>
                    <td className="px-4 py-3 text-end tabular-nums">{p.monthlyRent.toLocaleString()}</td>
                    <td className="px-4 py-3 text-end tabular-nums">{p.capacity}</td>
                    {canWrite && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button asChild variant="ghost" size="icon" aria-label={t("properties.edit")}>
                            <Link to={`/properties/${p.id}/edit`}>
                              <Pencil className="size-4" />
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t("properties.delete")}
                            disabled={remove.isPending}
                            onClick={() => onDelete(p.id, `${p.city}, ${p.address}`)}
                          >
                            <Trash2 className="text-destructive size-4" />
                          </Button>
                        </div>
                      </td>
                    )}
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
