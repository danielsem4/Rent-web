import { useState } from "react";
import { useDropzone } from "react-dropzone";
import type { FileRejection } from "react-dropzone";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FileText, Trash2, Upload, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { WorkerDocumentType } from "@/common/types/workerDocument";
import {
  DOC_TYPES,
  MAX_BYTES,
  ACCEPT,
  SELECT_CLASS,
  formatBytes,
  type StagedDocument,
} from "../lib/documentUpload";

/**
 * Create-mode document picker. A new worker has no id yet, so files are STAGED in
 * the browser and uploaded by the form right after the worker is saved (through the
 * same hardened endpoint the live uploader uses). Mirrors WorkerDocuments' UI.
 */
export default function WorkerDocumentDraft({
  staged,
  onChange,
  canWrite,
}: {
  staged: StagedDocument[];
  onChange: (next: StagedDocument[]) => void;
  canWrite: boolean;
}) {
  const { t } = useTranslation();
  const [docType, setDocType] = useState<WorkerDocumentType>("PASSPORT");

  const onDrop = (accepted: File[]) => {
    const file = accepted[0];
    if (!file) return;
    onChange([...staged, { uid: crypto.randomUUID(), file, docType }]);
  };
  const onDropRejected = (rejections: FileRejection[]) => {
    const code = rejections[0]?.errors[0]?.code;
    toast.error(
      code === "file-too-large"
        ? t("workers.documents.tooLarge")
        : t("workers.documents.invalidType"),
    );
  };
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    accept: ACCEPT,
    maxSize: MAX_BYTES,
    multiple: false,
    disabled: !canWrite,
  });

  const removeStaged = (uid: string) => onChange(staged.filter((s) => s.uid !== uid));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Paperclip className="size-4" />
          {t("workers.documents.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {canWrite && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex flex-col gap-1.5 sm:w-48">
                <Label htmlFor="draftDocType">{t("workers.documents.type")}</Label>
                <select
                  id="draftDocType"
                  className={cn(SELECT_CLASS)}
                  value={docType}
                  onChange={(e) => setDocType(e.target.value as WorkerDocumentType)}
                >
                  {DOC_TYPES.map((dt) => (
                    <option key={dt} value={dt}>
                      {t(`workers.documents.docTypes.${dt}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
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
              <span className="text-muted-foreground">{t("workers.documents.dropHint")}</span>
              <span className="text-muted-foreground text-xs">
                {t("workers.documents.constraints")}
              </span>
            </div>
            <p className="text-muted-foreground text-xs">{t("workers.documents.pendingHint")}</p>
          </div>
        )}

        {staged.length === 0 ? (
          <p className="text-muted-foreground py-2 text-sm">{t("workers.documents.empty")}</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {staged.map((s) => (
              <li key={s.uid} className="flex items-center gap-3 py-2">
                <FileText className="text-muted-foreground size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.file.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {t(`workers.documents.docTypes.${s.docType}`)} · {formatBytes(s.file.size)}
                  </p>
                </div>
                {canWrite && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("workers.documents.delete")}
                    onClick={() => removeStaged(s.uid)}
                  >
                    <Trash2 className="text-destructive size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
