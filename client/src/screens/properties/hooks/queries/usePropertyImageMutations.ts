import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { propertyImagesApi } from "@/api/propertyImagesApi";
import type { StagedImage } from "../../lib/imageUpload";
import { propertyImagesKey } from "./usePropertyImages";

export function useUploadPropertyImage(propertyId: number) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (file: File) => propertyImagesApi.upload(propertyId, file),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: propertyImagesKey(propertyId) });
      toast.success(t("properties.images.uploaded"));
    },
    onError: () => toast.error(t("properties.images.uploadFailed")),
  });
}

export function useDeletePropertyImage(propertyId: number) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (id: number) => propertyImagesApi.remove(propertyId, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: propertyImagesKey(propertyId) });
      toast.success(t("properties.images.deleted"));
    },
    onError: () => toast.error(t("properties.images.deleteFailed")),
  });
}

/**
 * Batch-upload staged images to a (just-created) property. The id is a call
 * argument because it isn't known until the property is saved. Uploads
 * sequentially, tolerates individual failures, and returns how many failed so the
 * caller can surface a single toast. Keeps API access in the hooks layer.
 */
export function useUploadPropertyImages() {
  const qc = useQueryClient();
  return async (propertyId: number, images: StagedImage[]): Promise<{ failed: number }> => {
    let failed = 0;
    for (const img of images) {
      try {
        await propertyImagesApi.upload(propertyId, img.file);
      } catch {
        failed += 1;
      }
    }
    void qc.invalidateQueries({ queryKey: propertyImagesKey(propertyId) });
    return { failed };
  };
}
