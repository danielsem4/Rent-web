import { useTranslation } from "react-i18next";
import { Loader2, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePropertyImageObjectUrl } from "../../hooks/queries/usePropertyImageObjectUrl";

/**
 * A single gallery thumbnail. Fetches the image bytes through the authenticated
 * download endpoint (via `usePropertyImageObjectUrl`) and renders them from an
 * object URL — never a public/inline server URL. Square, object-cover, with
 * loading + error states. Clickable when `onClick` is provided (opens a lightbox).
 */
export function PropertyImageThumb({
  propertyId,
  imageId,
  alt,
  onClick,
  className,
}: {
  propertyId: number;
  imageId: number;
  alt: string;
  onClick?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const { url, isLoading, isError } = usePropertyImageObjectUrl(propertyId, imageId);

  const inner = isLoading ? (
    <Loader2 className="text-muted-foreground size-5 animate-spin" />
  ) : isError || !url ? (
    <ImageOff className="text-muted-foreground size-5" aria-label={t("properties.images.loadFailed")} />
  ) : (
    <img src={url} alt={alt} className="size-full object-cover" />
  );

  const base = cn(
    "bg-muted flex aspect-square items-center justify-center overflow-hidden rounded-lg border",
    className,
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(base, "hover:ring-ring/50 cursor-pointer transition-shadow hover:ring-2")}
        aria-label={alt}
      >
        {inner}
      </button>
    );
  }
  return <div className={base}>{inner}</div>;
}
