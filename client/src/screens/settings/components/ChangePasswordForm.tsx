import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePasswordSchema } from "../schema/changePasswordSchema";
import type { ChangePasswordFormValues } from "../schema/changePasswordSchema";
import { useChangePassword } from "../hooks/queries/useChangePassword";

type FieldName = keyof ChangePasswordFormValues;

export default function ChangePasswordForm() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState<Record<FieldName, boolean>>({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const changePassword = useChangePassword(() => reset());

  const onSubmit = (values: ChangePasswordFormValues) =>
    changePassword.mutate(values);

  const toggle = (name: FieldName) =>
    setVisible((prev) => ({ ...prev, [name]: !prev[name] }));

  const fields: { name: FieldName; label: string; autoComplete: string }[] = [
    {
      name: "currentPassword",
      label: t("settings.currentPassword"),
      autoComplete: "current-password",
    },
    {
      name: "newPassword",
      label: t("settings.newPassword"),
      autoComplete: "new-password",
    },
    {
      name: "confirmPassword",
      label: t("settings.confirmPassword"),
      autoComplete: "new-password",
    },
  ];

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-5"
      noValidate
    >
      {fields.map(({ name, label, autoComplete }) => (
        <div key={name} className="flex flex-col gap-2">
          <Label htmlFor={name}>{label}</Label>
          <div className="relative">
            <Input
              id={name}
              type={visible[name] ? "text" : "password"}
              autoComplete={autoComplete}
              className="pe-11"
              {...register(name)}
              aria-invalid={!!errors[name]}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => toggle(name)}
              aria-label={
                visible[name]
                  ? t("login.hidePassword")
                  : t("login.showPassword")
              }
              className="text-muted-foreground hover:text-foreground absolute end-3 top-1/2 -translate-y-1/2 transition-colors"
            >
              {visible[name] ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
          {errors[name] && (
            <p className="text-destructive text-sm">
              {t(errors[name]?.message ?? "")}
            </p>
          )}
        </div>
      ))}

      <Button
        type="submit"
        className="w-fit"
        disabled={changePassword.isPending}
      >
        {changePassword.isPending && (
          <Loader2 className="size-4 animate-spin" />
        )}
        {t("settings.save")}
      </Button>
    </form>
  );
}
