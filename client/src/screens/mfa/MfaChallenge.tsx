import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/common/components/ThemeToggle";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useMfaStore } from "@/store/useMfaStore";
import { useMfaChallenge } from "./hooks/queries/useMfaChallenge";
import { useMfaResend } from "./hooks/queries/useMfaResend";
import logo from "@/common/assets/images/rent+logo-trans.png";

const OTP_LENGTH = 6;

export default function MfaChallenge() {
  const { t } = useTranslation();
  const mfaToken = useMfaStore((s) => s.mfaToken);
  const challenge = useMfaChallenge();
  const resend = useMfaResend();
  const [code, setCode] = useState("");

  // No token in memory (e.g. deep link or refresh): restart the login flow.
  // NOTE: we intentionally do NOT clear the token on unmount — under StrictMode the
  // mount→cleanup→mount cycle would null it on arrival and trip this guard. The
  // token is single-use (consumed server-side) and overwritten on the next login.
  if (!mfaToken) return <Navigate to="/login" replace />;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length !== OTP_LENGTH || challenge.isPending) return;
    challenge.mutate(code.trim());
  };

  return (
    <div className="relative flex min-h-svh items-center justify-center bg-muted p-4">
      <div className="absolute inset-e-4 top-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <img src={logo} alt="rent+" className="mb-4 h-16 w-auto" />
          <CardTitle className="flex items-center gap-2 text-2xl">
            <MailCheck className="size-6" aria-hidden />
            {t("mfa.challengeTitle")}
          </CardTitle>
          <CardDescription>{t("mfa.challengeSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col items-center gap-5">
            <InputOTP
              autoFocus
              dir="ltr"
              maxLength={OTP_LENGTH}
              inputMode="numeric"
              pattern="[0-9]*"
              value={code}
              onChange={setCode}
              onComplete={(value) => challenge.mutate(value.trim())}
              aria-invalid={challenge.isError}
            >
              <InputOTPGroup>
                {Array.from({ length: OTP_LENGTH }).map((_, i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>

            {challenge.isError && (
              <p className="text-destructive text-sm">{t("mfa.invalidCode")}</p>
            )}

            <Button
              type="submit"
              className="h-11 w-full rounded-full"
              disabled={code.trim().length !== OTP_LENGTH || challenge.isPending}
            >
              {challenge.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              {challenge.isPending ? t("common.loading") : t("mfa.verify")}
            </Button>

            <button
              type="button"
              onClick={() => resend.mutate()}
              disabled={resend.isPending}
              className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline disabled:opacity-50"
            >
              {resend.isPending ? t("common.loading") : t("mfa.resend")}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
