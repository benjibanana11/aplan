import { z } from "zod";

export const registerSchema = z.object({
  teamCode: z.string().min(1, "Code d'équipe requis"),
  name: z.string().min(1, "Nom requis"),
  email: z.string().email("Email invalide"),
  password: z.string().min(8, "Mot de passe : 8 caractères minimum"),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(1, "Mot de passe requis"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Mot de passe actuel requis"),
  newPassword: z.string().min(8, "Nouveau mot de passe : 8 caractères minimum"),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
