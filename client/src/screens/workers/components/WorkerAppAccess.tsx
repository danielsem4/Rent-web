import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Smartphone,
  QrCode,
  RotateCw,
  Power,
  Download,
  Loader2,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { workerAppAccessApi } from "@/api/workerAppAccessApi";
import {
  useWorkerAppAccess,
  useEnableAppAccess,
  useRotateWorkerQr,
  useDisableAppAccess,
} from "../hooks/queries/useWorkerAppAccess";

/**
 * Manager-only panel to control a worker's mobile-app access: enable (issue a QR +
 * claim the phone), view/rotate the QR, and disable (revokes all sessions). The QR
 * identifies the worker; a WhatsApp OTP still completes login, so it is safe to show
 * and print. All enforcement is server-side — this is UX only.
 */
export default function WorkerAppAccess({
  workerId,
  defaultPhone,
}: {
  workerId: number;
  defaultPhone: string | null;
}) {
  const { t } = useTranslation();
  const { data: status, isLoading } = useWorkerAppAccess(workerId);
  const enable = useEnableAppAccess(workerId);
  const rotate = useRotateWorkerQr(workerId);
  const disable = useDisableAppAccess(workerId);

  const [phone, setPhone] = useState("");
  // Keep the phone field in step with the loaded status/worker once known.
  useEffect(() => {
    setPhone(status?.phone ?? defaultPhone ?? "");
  }, [status?.phone, defaultPhone]);

  if (isLoading || !status) {
    return (
      <Card>
        <CardContent className="text-muted-foreground flex items-center gap-2 py-8">
          <Loader2 className="size-4 animate-spin" />
          {t("common.loading")}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Smartphone className="size-4" aria-hidden />
            {t("workers.appAccess.title")}
          </span>
          <StatusPill enabled={status.authEnabled} />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <p className="text-muted-foreground text-sm">{t("workers.appAccess.description")}</p>

        {!status.authEnabled ? (
          <EnablePanel
            phone={phone}
            setPhone={setPhone}
            pending={enable.isPending}
            onEnable={() => enable.mutate(phone.trim() || undefined)}
          />
        ) : (
          <EnabledPanel
            workerId={workerId}
            phone={status.phone}
            rotating={rotate.isPending}
            disabling={disable.isPending}
            onRotate={() => rotate.mutate()}
            onDisable={() => disable.mutate()}
          />
        )}
      </CardContent>
    </Card>
  );
}

function StatusPill({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        enabled ? "bg-success-bg text-success" : "bg-muted text-muted-foreground",
      )}
    >
      {enabled ? (
        <CheckCircle2 className="size-3.5" aria-hidden />
      ) : (
        <ShieldAlert className="size-3.5" aria-hidden />
      )}
      {enabled ? t("workers.appAccess.statusEnabled") : t("workers.appAccess.statusDisabled")}
    </span>
  );
}

/** Not-yet-enabled: capture/confirm the phone, then enable. */
function EnablePanel({
  phone,
  setPhone,
  pending,
  onEnable,
}: {
  phone: string;
  setPhone: (v: string) => void;
  pending: boolean;
  onEnable: () => void;
}) {
  const { t } = useTranslation();
  const canEnable = phone.trim().length >= 3 && !pending;
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("workers.appAccess.phoneLabel")}</span>
        <Input
          type="tel"
          inputMode="tel"
          dir="ltr"
          autoComplete="off"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+972501234567"
        />
        <span className="text-muted-foreground text-xs">{t("workers.appAccess.phoneHint")}</span>
      </label>
      <Button className="self-start" disabled={!canEnable} onClick={onEnable}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <QrCode className="size-4" />}
        {t("workers.appAccess.enable")}
      </Button>
    </div>
  );
}

/** Enabled: show the QR + rotate/disable controls. */
function EnabledPanel({
  workerId,
  phone,
  rotating,
  disabling,
  onRotate,
  onDisable,
}: {
  workerId: number;
  phone: string | null;
  rotating: boolean;
  disabling: boolean;
  onRotate: () => void;
  onDisable: () => void;
}) {
  const { t } = useTranslation();
  const qrUrl = useQrObjectUrl(workerId, rotating);

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
      {/* QR */}
      <div className="flex flex-col items-center gap-2">
        <div className="bg-card flex size-48 items-center justify-center rounded-xl border border-border p-2">
          {qrUrl ? (
            <img src={qrUrl} alt={t("workers.appAccess.qrAlt")} className="size-full" />
          ) : (
            <Loader2 className="text-muted-foreground size-5 animate-spin" />
          )}
        </div>
        {qrUrl && (
          <Button asChild variant="ghost" size="sm">
            <a href={qrUrl} download={`worker-${workerId}-qr.png`}>
              <Download className="size-4" />
              {t("workers.appAccess.download")}
            </a>
          </Button>
        )}
      </div>

      {/* Details + actions */}
      <div className="flex flex-1 flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-sm font-medium">
            {t("workers.appAccess.phoneLabel")}
          </span>
          <span dir="ltr" className="break-words">
            {phone ?? "—"}
          </span>
        </div>
        <p className="text-muted-foreground text-sm">{t("workers.appAccess.enabledHint")}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={rotating} onClick={onRotate}>
            {rotating ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />}
            {t("workers.appAccess.rotate")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-danger hover:text-danger"
            disabled={disabling}
            onClick={onDisable}
          >
            {disabling ? <Loader2 className="size-4 animate-spin" /> : <Power className="size-4" />}
            {t("workers.appAccess.disable")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Fetch the QR PNG as an object URL, refetching whenever `refreshSignal` transitions
 * from true→false (i.e. after a rotate completes). Revokes the URL on cleanup.
 */
function useQrObjectUrl(workerId: number, rotating: boolean): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    // Only (re)fetch when not mid-rotation; a rotate flips `rotating` true then false.
    if (rotating) return;
    let revoked = false;
    let objectUrl: string | null = null;
    void workerAppAccessApi
      .qrBlob(workerId)
      .then((blob) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setUrl(null));
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [workerId, rotating]);
  return url;
}
