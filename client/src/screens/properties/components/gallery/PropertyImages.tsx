import { useState } from "react";
import { useDropzone } from "react-dropzone";
import type { FileRejection } from "react-dropzone";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Trash2, Loader2, ImagePlus, Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";
import { MAX_BYTES, ACCEPT } from "../../lib/imageUpload";
import { usePropertyImages } from "../../hooks/queries/usePropertyImages";
import {
  useUploadPropertyImage,
  useDeletePropertyImage,
} from "../../hooks/queries/usePropertyImageMutations";
import { PropertyImageThumb } from "./PropertyImageThumb";
import { Lightbox } from "./Lightbox";

/**
 * Image manager for a saved property — used both in the edit form's Photos section
 * and as the property-view Gallery tab. Managers get an "Add photos" button (and
 * drag-drop) plus per-image delete; everyone can click a thumbnail to enlarge.
 * Uploads go through the hardened, tenant-scoped endpoint. Read-only when
 * `canWrite` is false (workers).
 */
export default function PropertyImages({
  propertyId,
  canWrite,
}: {
  propertyId: number;
  canWrite: boolean;
}) {
  const { t } = useTranslation();
  const { data: images, isLoading, isError } = usePropertyImages(propertyId);
  const upload = useUploadPropertyImage(propertyId);
  const remove = useDeletePropertyImage(propertyId);
  const [activeId, setActiveId] = useState<number | null>(null);
  const active = images?.find((img) => img.id === activeId) ?? null;

  const onDrop = (accepted: File[]) => {
    accepted.forEach((file) => upload.mutate(file));
  };
  const onDropRejected = (rejections: FileRejection[]) => {
    const code = rejections[0]?.errors[0]?.code;
    toast.error(
      code === "file-too-large"
        ? t("properties.images.tooLarge")
        : t("properties.images.invalidType"),
    );
  };
  // noClick/noKeyboard: the explicit "Add photos" button is the affordance (it
  // calls open()); the card body is only a drag target, so clicking thumbnails or
  // the delete button never opens the file dialog.
  const { getRootProps, getInputProps, open, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    accept: ACCEPT,
    maxSize: MAX_BYTES,
    multiple: true,
    noClick: true,
    noKeyboard: true,
    disabled: !canWrite || upload.isPending,
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Images className="size-4" />
            {t("properties.images.title")}
          </CardTitle>
          {canWrite && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={open}
              disabled={upload.isPending}
            >
              {upload.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ImagePlus className="size-4" />
              )}
              {t("properties.images.add")}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent
        {...(canWrite ? getRootProps() : {})}
        className={cn(
          "flex flex-col gap-4 rounded-b-xl transition-colors",
          canWrite && isDragActive && "ring-primary bg-primary/5 ring-2 ring-inset",
        )}
      >
        {canWrite && <input {...getInputProps()} />}

        {canWrite && isDragActive && (
          <p className="text-primary py-2 text-center text-sm">{t("properties.images.dropHint")}</p>
        )}

        {isLoading && (
          <div className="text-muted-foreground flex items-center gap-2 py-4">
            <Loader2 className="size-4 animate-spin" />
            {t("common.loading")}
          </div>
        )}
        {isError && <p className="text-destructive">{t("properties.images.loadFailed")}</p>}

        {images && images.length === 0 && (
          <p className="text-muted-foreground py-2 text-sm">{t("properties.images.empty")}</p>
        )}

        {images && images.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {images.map((img) => (
              <li key={img.id} className="group relative">
                <PropertyImageThumb
                  propertyId={propertyId}
                  imageId={img.id}
                  alt={img.originalName}
                  onClick={() => setActiveId(img.id)}
                />
                {canWrite && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        aria-label={t("properties.images.delete")}
                        disabled={remove.isPending}
                        className="absolute end-1.5 top-1.5 size-7 opacity-90 shadow-sm"
                      >
                        <Trash2 className="text-destructive size-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("properties.images.delete")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("properties.images.confirmDelete")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("properties.cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() => remove.mutate(img.id)}
                        >
                          {t("properties.images.delete")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {active && (
        <Lightbox
          propertyId={propertyId}
          imageId={active.id}
          alt={active.originalName}
          onClose={() => setActiveId(null)}
        />
      )}
    </Card>
  );
}
