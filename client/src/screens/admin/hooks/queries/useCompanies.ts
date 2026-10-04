import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { adminApi } from "@/api/adminApi";
import type { ICreateCompanyInput } from "@/common/types/company";
import type { ModuleKey } from "@/common/types/module";

export const companiesKey = ["admin", "companies"] as const;
export const companyKey = (id: number | undefined) => ["admin", "companies", id] as const;

/** List of all companies (platform admin). */
export function useCompanies() {
  return useQuery({ queryKey: companiesKey, queryFn: adminApi.listCompanies });
}

/** A single company's detail (modules + managers). */
export function useCompany(id: number | undefined) {
  return useQuery({
    queryKey: companyKey(id),
    queryFn: () => adminApi.getCompany(id as number),
    enabled: id !== undefined,
  });
}

export function useCreateCompany() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (input: ICreateCompanyInput) => adminApi.createCompany(input),
    onSuccess: (company) => {
      void qc.invalidateQueries({ queryKey: companiesKey });
      toast.success(t("admin.companyCreated"));
      navigate(`/admin/companies/${company.id}`);
    },
    onError: () => toast.error(t("admin.saveFailed")),
  });
}

export function useSetCompanyModules(id: number) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (modules: ModuleKey[]) => adminApi.setModules(id, modules),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: companyKey(id) });
      void qc.invalidateQueries({ queryKey: companiesKey });
      toast.success(t("admin.modulesSaved"));
    },
    onError: () => toast.error(t("admin.saveFailed")),
  });
}

export function useUpdateCompany(id: number) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (input: { name?: string; isActive?: boolean }) =>
      adminApi.updateCompany(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: companyKey(id) });
      void qc.invalidateQueries({ queryKey: companiesKey });
      toast.success(t("admin.companyUpdated"));
    },
    onError: () => toast.error(t("admin.saveFailed")),
  });
}

export function useCreateManager(id: number) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (input: { email: string; name: string }) => adminApi.createManager(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: companyKey(id) });
      void qc.invalidateQueries({ queryKey: companiesKey });
      toast.success(t("admin.managerInvited"));
    },
    onError: () => toast.error(t("admin.saveFailed")),
  });
}
