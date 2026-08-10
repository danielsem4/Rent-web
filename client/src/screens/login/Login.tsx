import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { loginSchema } from "./schema/loginSchema";
import type { LoginFormValues } from "./schema/loginSchema";
import { useLogin } from "./hooks/queries/useLogin";
import logo from "@/common/assets/images/rent+logo-trans.png";

export default function Login() {
  const { t } = useTranslation();
  const login = useLogin();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = (values: LoginFormValues) => login.mutate(values);

  const fieldClass =
    "h-11 rounded-full transition-all " +
    "focus-visible:border-primary/60 focus-visible:ring-4 focus-visible:ring-primary/25 " +
    "focus-visible:shadow-[0_0_18px_-3px_var(--color-primary)]";

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <img src={logo} alt="rent+" className="mb-4 h-16 w-auto" />
          <CardTitle className="text-2xl">{t("login.title")}</CardTitle>
          <CardDescription>{t("login.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-5"
            noValidate
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">{t("login.email")}</Label>
              <div className="relative">
                <Mail
                  aria-hidden
                  className="text-muted-foreground pointer-events-none absolute inset-s-4 top-1/2 size-4 -translate-y-1/2"
                />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder={t("login.emailPlaceholder")}
                  className={`${fieldClass} ps-11`}
                  {...register("email")}
                  aria-invalid={!!errors.email}
                />
              </div>
              {errors.email && (
                <p className="text-destructive text-sm">
                  {t(errors.email.message ?? "")}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">{t("login.password")}</Label>
              <div className="relative">
                <Lock
                  aria-hidden
                  className="text-muted-foreground pointer-events-none absolute inset-s-4 top-1/2 size-4 -translate-y-1/2"
                />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder={t("login.passwordPlaceholder")}
                  className={`${fieldClass} ps-11 pe-11`}
                  {...register("password")}
                  aria-invalid={!!errors.password}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={
                    showPassword
                      ? t("login.hidePassword")
                      : t("login.showPassword")
                  }
                  className="text-muted-foreground hover:text-foreground absolute inset-e-4 top-1/2 -translate-y-1/2 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="text-destructive text-sm">
                  {t(errors.password.message ?? "")}
                </p>
              )}
            </div>

            {login.isError && (
              <p className="text-destructive text-sm">{t("login.failed")}</p>
            )}

            <Button
              type="submit"
              className="h-11 w-full rounded-full"
              disabled={login.isPending}
            >
              {login.isPending && <Loader2 className="size-4 animate-spin" />}
              {login.isPending ? t("common.loading") : t("login.submit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
