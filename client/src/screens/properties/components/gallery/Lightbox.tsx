import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, X, ImageOff } from "lucide-react";
import { usePropertyImageObjectUrl } from "../../hooks/queries/usePropertyImageObjectUrl";

/**
 * Presentational full-screen overlay chrome (no external dialog dep): closes on
 * backdrop click, the close button, or Escape, and locks body scroll while open.
 * Renders whatever `url` it is given — the caller resolves the source (an
 * authenticated blob object URL for saved images, or a local preview URL for
 * staged ones), so uploaded bytes are never pointed at inline/public server URLs.
 */
export function LightboxShell({
  alt,
  url,
  isLoading,
  isError,
  onClose,
}: {
  alt: string;
  url: string | null;
  isLoading: boolean;
  isError: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  // Close on Escape; lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t("properties.images.close")}
        className="absolute end-4 top-4 rounded-md p-2 text-white/90 transition-colors hover:bg-white/10"
      >
        <X className="size-6" />
      </button>

      {isLoading ? (
        <Loader2 className="size-8 animate-spin text-white/80" />
      ) : isError || !url ? (
        <div className="flex flex-col items-center gap-2 text-white/80">
          <ImageOff className="size-8" />
          <span className="text-sm">{t("properties.images.loadFailed")}</span>
        </div>
      ) : (
        <img
          src={url}
          alt={alt}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
        />
      )}
    </div>
  );
}

/**
 * Full-screen viewer for a SAVED property image. Fetches the bytes through the
 * same authenticated blob hook as the thumbnails (react-query dedupes the request)
 * and hands the resulting object URL to the shell.
 */
export function Lightbox({
  propertyId,
  imageId,
  alt,
  onClose,
}: {
  propertyId: number;
  imageId: number;
  alt: string;
  onClose: () => void;
}) {
  const { url, isLoading, isError } = usePropertyImageObjectUrl(propertyId, imageId);
  return (
    <LightboxShell alt={alt} url={url} isLoading={isLoading} isError={isError} onClose={onClose} />
  );
}
