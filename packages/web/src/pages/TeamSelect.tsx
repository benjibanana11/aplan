import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Building2 } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import { AuthCard } from "../components/AuthCard";

export function TeamSelect() {
  const { user, pendingTeams, selectTeam } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);

  if (user) return <Navigate to="/" replace />;
  if (!pendingTeams) return <Navigate to="/login" replace />;

  async function handleSelect(teamId: string) {
    setError(null);
    setSelecting(teamId);
    try {
      await selectTeam(teamId);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erreur lors de la sélection de l'équipe");
      setSelecting(null);
    }
  }

  return (
    <AuthCard title="Choisir une équipe">
      <div className="flex flex-col gap-4">
        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <p className="text-center text-sm text-slate-500">
          Votre compte est lié à plusieurs équipes. Choisissez celle avec laquelle vous connecter.
        </p>
        <div className="flex flex-col gap-2">
          {pendingTeams.map((team) => (
            <button
              key={team.teamId}
              type="button"
              onClick={() => handleSelect(team.teamId)}
              disabled={selecting !== null}
              className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 text-left hover:border-blue-300 hover:bg-blue-50 disabled:opacity-60"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                <Building2 className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{team.teamName}</p>
                <p className="truncate text-xs text-slate-500">{team.companyName}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </AuthCard>
  );
}
