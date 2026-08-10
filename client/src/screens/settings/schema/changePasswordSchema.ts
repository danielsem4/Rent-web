import { z } from "zod";

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "settings.errCurrentRequired"),
    newPassword: z.string().min(8, "settings.errPasswordMin"),
    confirmPassword: z.string().min(1, "settings.errConfirmRequired"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "settings.errPasswordMismatch",
    path: ["confirmPassword"],
  });

export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;
