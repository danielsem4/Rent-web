import { useState } from "react";
import { useDropzone } from "react-dropzone";
import type { FileRejection } from "react-dropzone";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FileText, Download, Trash2, Loader2, Upload, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
import type { WorkerDocumentType } from "@/common/types/workerDocument";
import { useWorkerDocuments } from "../hooks/queries/useWorkerDocuments";
import {
  useUploadWorkerDocument,
  useDeleteWorkerDocument,
  useDownloadWorkerDocument,
} from "../hooks/queries/useWorkerDocumentMutations";

const DOC_TYPES: WorkerDocumentType[] = ["PASSPORT", "VISA", "INSURANCE", "OTHER"];
const MAX_BYTES = 10 * 1024 * 1024;
// Mirrors the server allow-list; the server (magic bytes) is the enforcement point.
const ACCEPT = {
  "application/pdf": [".pdf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
};

const SELECT_CLASS =
  "border-input bg-transparent h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function WorkerDocuments({
  workerId,
  canWrite,
}: {
  workerId: number;
  canWrite: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { data: documents, isLoading, isError } = useWorkerDocuments(workerId);
  const upload = useUploadWorkerDocument(workerId);
  const remove = useDeleteWorkerDocument(workerId);
  const download = useDownloadWorkerDocument(workerId);
  const [docType, setDocType] = useState<WorkerDocumentType>("PASSPORT");

  const onDrop = (accepted: File[]) => {
    const file = accepted[0];
    if (file) upload.mutate({ file, docType });
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
    disabled: !canWrite || upload.isPending,
  });

  const formatDate = (value: string) => new Date(value).toLocaleDateString(i18n.language);

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
                <Label htmlFor="docType">{t("workers.documents.type")}</Label>
                <select
                  id="docType"
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
                (!canWrite || upload.isPending) && "pointer-events-none opacity-60",
              )}
            >
              <input {...getInputProps()} />
              {upload.isPending ? (
                <span className="text-muted-foreground flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  {t("workers.documents.uploading")}
                </span>
              ) : (
                <>
                  <Upload className="text-muted-foreground size-5" />
                  <span className="text-muted-foreground">{t("workers.documents.dropHint")}</span>
                  <span className="text-muted-foreground text-xs">
                    {t("workers.documents.constraints")}
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="text-muted-foreground flex items-center gap-2 py-4">
            <Loader2 className="size-4 animate-spin" />
            {t("common.loading")}
          </div>
        )}
        {isError && <p className="text-destructive">{t("workers.documents.loadFailed")}</p>}

        {documents && documents.length === 0 && (
          <p className="text-muted-foreground py-2 text-sm">{t("workers.documents.empty")}</p>
        )}

        {documents && documents.length > 0 && (
          <ul className="flex flex-col divide-y">
            {documents.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2">
                <FileText className="text-muted-foreground size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.originalName}</p>
                  <p className="text-muted-foreground text-xs">
                    {t(`workers.documents.docTypes.${d.docType}`)} · {formatBytes(d.size)} ·{" "}
                    {formatDate(d.createdAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("workers.documents.download")}
                  onClick={() => void download(d.id, d.originalName)}
                >
                  <Download className="size-4" />
                </Button>
                {canWrite && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("workers.documents.delete")}
                        disabled={remove.isPending}
                      >
                        <Trash2 className="text-destructive size-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("workers.documents.delete")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("workers.documents.confirmDelete", { label: d.originalName })}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("workers.cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() => remove.mutate(d.id)}
                        >
                          {t("workers.documents.delete")}
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
    </Card>
  );
}
