import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/store/useAuthStore";
import { CompanyGrid } from "./components/CompanyGrid";
import { CompanyFormDialog } from "./components/CompanyFormDialog";
import { DeleteCompanyDialog } from "./components/DeleteCompanyDialog";
import { useCompaniesQuery } from "./hooks/queries/useCompaniesQuery";
import { useCreateCompany } from "./hooks/queries/useCreateCompany";
import { useUpdateCompany } from "./hooks/queries/useUpdateCompany";
import { useDeleteCompany } from "./hooks/queries/useDeleteCompany";
import type { ICompany } from "@/common/types/company";
import type { CompanyInput } from "@/api/companyApi";

export default function Companies() {
  const { t } = useTranslation();
  const role = useAuthStore((s) => s.user?.role);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ICompany | null>(null);
  const [deleting, setDeleting] = useState<ICompany | null>(null);

  const companiesQuery = useCompaniesQuery();
  const createCompany = useCreateCompany();
  const updateCompany = useUpdateCompany();
  const deleteCompany = useDeleteCompany();

  // UI-only gate; the API enforces SUPER_ADMIN independently.
  if (role !== "SUPER_ADMIN") {
    return <Navigate to="/" replace />;
  }

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (company: ICompany) => {
    setEditing(company);
    setFormOpen(true);
  };

  const handleSubmit = (input: CompanyInput) => {
    if (editing) {
      updateCompany.mutate({ id: editing.id, input }, { onSuccess: () => setFormOpen(false) });
    } else {
      createCompany.mutate(input, { onSuccess: () => setFormOpen(false) });
    }
  };

  const handleDelete = () => {
    if (!deleting) return;
    deleteCompany.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
  };

  const companies = companiesQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("companies.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("companies.subtitle")}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          {t("companies.add")}
        </Button>
      </div>

      {companiesQuery.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : companies.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="font-medium">{t("companies.empty")}</p>
          <p className="text-muted-foreground mt-1 text-sm">{t("companies.emptyHint")}</p>
        </div>
      ) : (
        <CompanyGrid companies={companies} onEdit={openEdit} onDelete={setDeleting} />
      )}

      <CompanyFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        company={editing}
        onSubmit={handleSubmit}
        isPending={createCompany.isPending || updateCompany.isPending}
      />

      <DeleteCompanyDialog
        company={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        onConfirm={handleDelete}
        isPending={deleteCompany.isPending}
      />
    </div>
  );
}
