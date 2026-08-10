import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ICompany } from "@/common/types/company";

interface DeleteCompanyDialogProps {
  company: ICompany | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
}

export function DeleteCompanyDialog({
  company,
  onOpenChange,
  onConfirm,
  isPending,
}: DeleteCompanyDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={!!company} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("companies.deleteTitle")}</DialogTitle>
          <DialogDescription>{t("companies.deleteBody")}</DialogDescription>
        </DialogHeader>
        {company && <p className="text-sm font-medium">{company.name}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("companies.cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending && <Loader2 className="size-4 animate-spin" />}
            {t("companies.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
