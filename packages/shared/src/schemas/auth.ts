import { z } from "zod";

export const registerSchema = z.object({
  teamCode: z.string().min(1, "Code d'équipe requis"),
  name: z.string().min(1, "Nom requis"),
  email: z.string().email("Email invalide"),
  password: z.string().min(8, "Mot de passe : 8 caractères minimum"),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const registerNewTeamSchema = z.object({
  companyName: z.string().min(1, "Nom d'entreprise requis"),
  teamName: z.string().min(1, "Nom d'équipe requis"),
  teamCode: z
    .string()
    .min(3, "Code d'équipe : 3 caractères minimum")
    .regex(/^[A-Za-z0-9-]+$/, "Lettres, chiffres et tirets uniquement"),
  name: z.string().min(1, "Nom requis"),
  email: z.string().email("Email invalide"),
  password: z.string().min(8, "Mot de passe : 8 caractères minimum"),
});
export type RegisterNewTeamInput = z.infer<typeof registerNewTeamSchema>;

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

export const selectTeamSchema = z.object({
  teamId: z.string().min(1, "Équipe requise"),
});
export type SelectTeamInput = z.infer<typeof selectTeamSchema>;

export const switchTeamSchema = z.object({
  teamId: z.string().min(1, "Équipe requise"),
});
export type SwitchTeamInput = z.infer<typeof switchTeamSchema>;
