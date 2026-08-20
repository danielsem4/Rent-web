import { LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLogout } from "@/hooks/common/useLogout";
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

/**
 * Solid-red logout button for the sidebar footer. Clicking opens an
 * "are you sure?" confirmation; confirming runs the shared useLogout()
 * flow (best-effort server logout + store reset + redirect to /login).
 */
export default function SidebarLogout() {
  const { t } = useTranslation();
  const logout = useLogout();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-start border-destructive text-base text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="size-5" />
          {t("common.logout")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("logout.confirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("logout.confirmMessage")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("logout.cancel")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => void logout()}>
            {t("logout.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
