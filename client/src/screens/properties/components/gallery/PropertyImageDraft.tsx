import { useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import type { FileRejection } from "react-dropzone";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Trash2, Upload, Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { MAX_BYTES, ACCEPT, type StagedImage } from "../../lib/imageUpload";
import { LightboxShell } from "./Lightbox";

/**
 * Create-mode image picker. A new property has no id yet, so images are STAGED in
 * the browser (with object-URL previews) and uploaded by the form right after the
 * property is saved (through the same hardened endpoint the live uploader uses).
 */
export default function PropertyImageDraft({
  staged,
  onChange,
  canWrite,
}: {
  staged: StagedImage[];
  onChange: (next: StagedImage[]) => void;
  canWrite: boolean;
}) {
  const { t } = useTranslation();
  const [activeUid, setActiveUid] = useState<string | null>(null);
  const active = staged.find((s) => s.uid === activeUid) ?? null;

  // Revoke every preview object URL on unmount (navigating away without saving),
  // so staged previews never leak. `stagedRef` mirrors the latest set (updated in
  // an effect, not during render) and is read by the unmount-only cleanup.
  const stagedRef = useRef(staged);
  useEffect(() => {
    stagedRef.current = staged;
  }, [staged]);
  useEffect(() => {
    return () => {
      stagedRef.current.forEach((s) => URL.revokeObjectURL(s.previewUrl));
    };
  }, []);

  const onDrop = (accepted: File[]) => {
    if (accepted.length === 0) return;
    const additions = accepted.map((file) => ({
      uid: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    onChange([...staged, ...additions]);
  };
  const onDropRejected = (rejections: FileRejection[]) => {
    const code = rejections[0]?.errors[0]?.code;
    toast.error(
      code === "file-too-large"
        ? t("properties.images.tooLarge")
        : t("properties.images.invalidType"),
    );
  };
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    accept: ACCEPT,
    maxSize: MAX_BYTES,
    multiple: true,
    disabled: !canWrite,
  });

  const removeStaged = (uid: string) => {
    if (activeUid === uid) setActiveUid(null); // close the viewer before revoking its URL
    const target = staged.find((s) => s.uid === uid);
    if (target) URL.revokeObjectURL(target.previewUrl);
    onChange(staged.filter((s) => s.uid !== uid));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Images className="size-4" />
          {t("properties.images.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {canWrite && (
          <div className="flex flex-col gap-2">
            <div
              {...getRootProps()}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-6 text-center text-sm transition-colors",
                isDragActive ? "border-primary bg-primary/5" : "border-input hover:bg-accent/40",
                !canWrite && "pointer-events-none opacity-60",
              )}
            >
              <input {...getInputProps()} />
              <Upload className="text-muted-foreground size-5" />
              <span className="text-muted-foreground">{t("properties.images.dropHint")}</span>
              <span className="text-muted-foreground text-xs">
                {t("properties.images.constraints")}
              </span>
            </div>
            <p className="text-muted-foreground text-xs">{t("properties.images.pendingHint")}</p>
          </div>
        )}

        {staged.length === 0 ? (
          <p className="text-muted-foreground py-2 text-sm">{t("properties.images.empty")}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {staged.map((s) => (
              <li key={s.uid} className="group relative">
                <button
                  type="button"
                  onClick={() => setActiveUid(s.uid)}
                  aria-label={s.file.name}
                  className="bg-muted hover:ring-ring/50 flex aspect-square w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg border transition-shadow hover:ring-2"
                >
                  <img src={s.previewUrl} alt={s.file.name} className="size-full object-cover" />
                </button>
                {canWrite && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    aria-label={t("properties.images.delete")}
                    onClick={() => removeStaged(s.uid)}
                    className="absolute end-1.5 top-1.5 size-7 opacity-90 shadow-sm"
                  >
                    <Trash2 className="text-destructive size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {active && (
        <LightboxShell
          alt={active.file.name}
          url={active.previewUrl}
          isLoading={false}
          isError={false}
          onClose={() => setActiveUid(null)}
        />
      )}
    </Card>
  );
}
