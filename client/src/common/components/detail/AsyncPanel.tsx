import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Renders a card-framed loading spinner or error message for a query, else its
 * children. Keeps the data panels free of repeated state boilerplate.
 */
export function AsyncPanel({
  isLoading,
  isError,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="text-muted-foreground flex items-center gap-2 py-8">
          <Loader2 className="size-4 animate-spin" />
          {t("common.loading")}
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="text-destructive py-8 text-center">
          {t("properties.loadFailedSection")}
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}
