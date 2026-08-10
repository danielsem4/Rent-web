import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { companySchema } from "../schema/companySchema";
import type { CompanyFormValues } from "../schema/companySchema";
import type { CompanyInput } from "@/api/companyApi";
import type { ICompany } from "@/common/types/company";

interface CompanyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: ICompany | null;
  onSubmit: (input: CompanyInput) => void;
  isPending: boolean;
}

const EMPTY: CompanyFormValues = { name: "" };

export function CompanyFormDialog({
  open,
  onOpenChange,
  company,
  onSubmit,
  isPending,
}: CompanyFormDialogProps) {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    reset(company ? { name: company.name } : EMPTY);
  }, [open, company, reset]);

  const submit = handleSubmit((v) => onSubmit({ name: v.name.trim() }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {company ? t("companies.formEditTitle") : t("companies.formCreateTitle")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">{t("companies.fName")}</Label>
            <Input id="name" {...register("name")} aria-invalid={!!errors.name} autoFocus />
            {errors.name && (
              <p className="text-destructive text-sm">{t(errors.name.message ?? "")}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("companies.cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="size-4 animate-spin" />}
              {t("companies.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
