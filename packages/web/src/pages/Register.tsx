import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import { AuthCard } from "../components/AuthCard";
import { Button } from "../components/Button";
import { inputClass, labelClass } from "../components/formStyles";

type Mode = "join" | "create";

export function Register() {
  const { register, registerNewTeam } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("join");
  const [teamCode, setTeamCode] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (mode === "join") {
        await register(teamCode, name, email, password);
      } else {
        await registerNewTeam(companyName, teamName, teamCode, name, email, password);
      }
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de l'inscription");
    }
  }

  return (
    <AuthCard title="Inscription">
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setMode("join")}
          className={`rounded-md py-1.5 text-sm font-medium transition-colors ${
            mode === "join" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Rejoindre une équipe
        </button>
        <button
          type="button"
          onClick={() => setMode("create")}
          className={`rounded-md py-1.5 text-sm font-medium transition-colors ${
            mode === "create" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Créer une équipe
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {mode === "join" ? (
          <label className={labelClass}>
            Code d'équipe
            <input value={teamCode} onChange={(e) => setTeamCode(e.target.value)} required className={inputClass} />
          </label>
        ) : (
          <>
            <label className={labelClass}>
              Nom de l'entreprise
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Nom de l'équipe
              <input value={teamName} onChange={(e) => setTeamName(e.target.value)} required className={inputClass} />
            </label>
            <label className={labelClass}>
              Code d'équipe (pour inviter d'autres personnes)
              <input
                value={teamCode}
                onChange={(e) => setTeamCode(e.target.value.toUpperCase())}
                required
                className={inputClass}
              />
            </label>
          </>
        )}

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
          {mode === "join" ? "S'inscrire" : "Créer l'équipe"}
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
