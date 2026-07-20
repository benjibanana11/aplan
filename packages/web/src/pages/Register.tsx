import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import { AuthCard } from "../components/AuthCard";
import { Button } from "../components/Button";
import { inputClass, labelClass } from "../components/formStyles";

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [teamCode, setTeamCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await register(teamCode, name, email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'inscription");
    }
  }

  return (
    <AuthCard title="Inscription">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <label className={labelClass}>
          Code d'équipe
          <input
            value={teamCode}
            onChange={(e) => setTeamCode(e.target.value)}
            required
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Nom
          <input value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
        </label>
        <label className={labelClass}>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Mot de passe
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            className={inputClass}
          />
        </label>
        <Button type="submit" variant="primary" className="justify-center">
          S'inscrire
        </Button>
        <p className="text-center text-sm text-slate-500">
          Déjà un compte ?{" "}
          <Link to="/login" className="font-medium text-blue-600 hover:underline">
            Se connecter
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
