import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCards } from "./components/KpiCards";
import { PropertyGrid } from "./components/PropertyGrid";
import { PropertyFormDialog } from "./components/PropertyFormDialog";
import { DeletePropertyDialog } from "./components/DeletePropertyDialog";
import { usePropertiesQuery } from "./hooks/queries/usePropertiesQuery";
import { usePropertyStatsQuery } from "./hooks/queries/usePropertyStatsQuery";
import { useCreateProperty } from "./hooks/queries/useCreateProperty";
import { useUpdateProperty } from "./hooks/queries/useUpdateProperty";
import { useDeleteProperty } from "./hooks/queries/useDeleteProperty";
import type { IProperty } from "@/common/types/property";
import type { PropertyInput } from "@/api/propertyApi";

export default function Properties() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<IProperty | null>(null);
  const [deleting, setDeleting] = useState<IProperty | null>(null);

  const propertiesQuery = usePropertiesQuery();
  const statsQuery = usePropertyStatsQuery();
  const createProperty = useCreateProperty();
  const updateProperty = useUpdateProperty();
  const deleteProperty = useDeleteProperty();

  const filtered = useMemo(() => {
    const list = propertiesQuery.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) => p.city.toLowerCase().includes(q) || p.address.toLowerCase().includes(q),
    );
  }, [propertiesQuery.data, search]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (property: IProperty) => {
    setEditing(property);
    setFormOpen(true);
  };

  const handleSubmit = (input: PropertyInput) => {
    if (editing) {
      updateProperty.mutate({ id: editing.id, input }, { onSuccess: () => setFormOpen(false) });
    } else {
      createProperty.mutate(input, { onSuccess: () => setFormOpen(false) });
    }
  };

  const handleDelete = () => {
    if (!deleting) return;
    deleteProperty.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("properties.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("properties.subtitle")}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          {t("properties.add")}
        </Button>
      </div>

      <KpiCards stats={statsQuery.data} isLoading={statsQuery.isLoading} />

      <div className="relative max-w-sm">
        <Search
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("properties.search")}
          className="ps-9"
        />
      </div>

      {propertiesQuery.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="font-medium">{t("properties.empty")}</p>
          <p className="text-muted-foreground mt-1 text-sm">{t("properties.emptyHint")}</p>
        </div>
      ) : (
        <PropertyGrid properties={filtered} onEdit={openEdit} onDelete={setDeleting} />
      )}

      <PropertyFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        property={editing}
        onSubmit={handleSubmit}
        isPending={createProperty.isPending || updateProperty.isPending}
      />

      <DeletePropertyDialog
        property={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        onConfirm={handleDelete}
        isPending={deleteProperty.isPending}
      />
    </div>
  );
}
