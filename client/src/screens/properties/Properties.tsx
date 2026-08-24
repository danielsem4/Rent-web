import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Eye, Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { useAuthStore } from "@/store/useAuthStore";
import { ROLES } from "@/common/types/role";
import { useProperties } from "./hooks/queries/useProperties";
import { useDeleteProperty } from "./hooks/queries/usePropertyMutations";
import { OccupancyChip } from "./components/Occupancy";

export default function Properties() {
  const { t, i18n } = useTranslation();
  const { data: properties, isLoading, isError } = useProperties();
  const remove = useDeleteProperty();
  // UX-only gating — the server is the enforcement point (workers get 403 on writes).
  const role = useAuthStore((s) => s.user?.role);
  const canWrite = role === ROLES.COMPANY_MANAGER;

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
        <Card className="overflow-hidden">
          {/* Table scrolls inside its own container on narrow screens — the page
              itself never overflows sideways. */}
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("properties.city")}</TableHead>
                  <TableHead>{t("properties.address")}</TableHead>
                  <TableHead>{t("properties.owner")}</TableHead>
                  <TableHead className="text-end">{t("properties.rent")}</TableHead>
                  <TableHead className="text-end">{t("properties.occupancy")}</TableHead>
                  <TableHead className="text-end">{t("properties.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {properties.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.city}</TableCell>
                    <TableCell className="text-muted-foreground">{p.address}</TableCell>
                    <TableCell>{p.ownerName ?? "—"}</TableCell>
                    <TableCell className="text-end tabular-nums">
                      {p.monthlyRent.toLocaleString(i18n.language)}
                    </TableCell>
                    <TableCell className="text-end">
                      <OccupancyChip total={p.total} maxCapacity={p.maxCapacity} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          aria-label={t("properties.view")}
                        >
                          <Link to={`/properties/${p.id}`}>
                            <Eye className="size-4" />
                          </Link>
                        </Button>
                        {canWrite && (
                          <>
                            <Button
                              asChild
                              variant="ghost"
                              size="icon"
                              aria-label={t("properties.edit")}
                            >
                              <Link to={`/properties/${p.id}/edit`}>
                                <Pencil className="size-4" />
                              </Link>
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
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
                                    {t("properties.confirmDelete", {
                                      label: `${p.city}, ${p.address}`,
                                    })}
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
