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
import type { IProperty } from "@/common/types/property";

interface DeletePropertyDialogProps {
  property: IProperty | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
}

export function DeletePropertyDialog({
  property,
  onOpenChange,
  onConfirm,
  isPending,
}: DeletePropertyDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={!!property} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("properties.deleteTitle")}</DialogTitle>
          <DialogDescription>{t("properties.deleteBody")}</DialogDescription>
        </DialogHeader>
        {property && (
          <p className="text-sm font-medium">
            {property.city} — {property.address}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("properties.cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending && <Loader2 className="size-4 animate-spin" />}
            {t("properties.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
