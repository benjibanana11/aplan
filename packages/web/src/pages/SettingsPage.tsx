import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { inputClass, labelClass } from "../components/formStyles";

export function SettingsPage() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError("Les deux mots de passe ne correspondent pas");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/auth/change-password", { currentPassword, newPassword });
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors du changement de mot de passe");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader title="Réglages" subtitle="Gérez les paramètres de votre compte" />

      <Card title="Mon compte">
        <div className="flex flex-col gap-1 text-sm text-slate-600">
          <p>
            <span className="font-medium text-slate-900">Nom :</span> {user?.name}
          </p>
          <p>
            <span className="font-medium text-slate-900">Email :</span> {user?.email}
          </p>
        </div>
      </Card>

      <div className="mt-6">
        <Card title="Changer le mot de passe">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
            {success && (
              <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                Mot de passe modifié avec succès.
              </p>
            )}
            <label className={labelClass}>
              Mot de passe actuel
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Nouveau mot de passe
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Confirmer le nouveau mot de passe
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
                className={inputClass}
              />
            </label>
            <div>
              <Button type="submit" variant="primary" disabled={submitting}>
                Changer le mot de passe
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
