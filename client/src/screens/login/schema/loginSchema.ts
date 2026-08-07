import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("login.errEmail"),
  password: z.string().min(1, "login.errPassword"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
