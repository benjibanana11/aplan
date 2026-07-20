import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AuthCard } from "../components/AuthCard";
import { Button } from "../components/Button";
import { inputClass, labelClass } from "../components/formStyles";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
      navigate("/");
    } catch {
      setError("Identifiants invalides");
    }
  }

  return (
    <AuthCard title="Connexion">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
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
            required
            className={inputClass}
          />
        </label>
        <Button type="submit" variant="primary" className="justify-center">
          Se connecter
        </Button>
        <p className="text-center text-sm text-slate-500">
          Pas de compte ?{" "}
          <Link to="/register" className="font-medium text-blue-600 hover:underline">
            S'inscrire
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
