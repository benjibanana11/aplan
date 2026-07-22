import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Users, Building2 } from "lucide-react";
import { api, ApiError } from "../../api/client";
import { PageHeader } from "../../components/PageHeader";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { inputClass, labelClass } from "../../components/formStyles";

interface Team {
  id: string;
  name: string;
  teamCode: string;
  memberCount: number;
}

interface Company {
  id: string;
  name: string;
  teams: Team[];
}

const COMPANIES_QUERY_KEY = ["admin-companies"];

function NewTeamForm({ companyId, onDone }: { companyId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [teamCode, setTeamCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createTeam = useMutation({
    mutationFn: () => api.post<Team>(`/admin/companies/${companyId}/teams`, { name, teamCode }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COMPANIES_QUERY_KEY });
      onDone();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Erreur lors de la création"),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        createTeam.mutate();
      }}
      className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-slate-300 p-3"
    >
      {error && <p className="w-full text-sm text-red-700">{error}</p>}
      <label className={`${labelClass} w-40`}>
        Nom de l'équipe
        <input value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
      </label>
      <label className={`${labelClass} w-40`}>
        Code d'équipe
        <input
          value={teamCode}
          onChange={(e) => setTeamCode(e.target.value.toUpperCase())}
          required
          className={inputClass}
        />
      </label>
      <Button type="submit" variant="secondary" disabled={createTeam.isPending}>
        <Plus className="h-4 w-4" />
        Ajouter
      </Button>
      <Button type="button" variant="ghost" onClick={onDone}>
        Annuler
      </Button>
    </form>
  );
}

function CompanyCard({ company }: { company: Company }) {
  const [addingTeam, setAddingTeam] = useState(false);

  return (
    <Card
      title={company.name}
      actions={
        !addingTeam && (
          <Button variant="secondary" onClick={() => setAddingTeam(true)}>
            <Plus className="h-4 w-4" />
            Nouvelle équipe
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-2">
        {company.teams.map((team) => (
          <div
            key={team.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{team.name}</p>
              <p className="flex items-center gap-1 text-xs text-slate-500">
                <Users className="h-3 w-3" />
                {team.memberCount} membre{team.memberCount !== 1 ? "s" : ""}
              </p>
            </div>
            <code className="shrink-0 rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
              {team.teamCode}
            </code>
          </div>
        ))}
        {company.teams.length === 0 && <p className="text-sm text-slate-500">Aucune équipe pour l'instant.</p>}
        {addingTeam && <NewTeamForm companyId={company.id} onDone={() => setAddingTeam(false)} />}
      </div>
    </Card>
  );
}

function NewCompanyPanel({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamCode, setTeamCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createCompany = useMutation({
    mutationFn: () => api.post<Company>("/admin/companies", { name, teamName, teamCode }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COMPANIES_QUERY_KEY });
      onDone();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Erreur lors de la création"),
  });

  return (
    <Card title="Nouvelle entreprise">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          createCompany.mutate();
        }}
        className="flex flex-col gap-4"
      >
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
        <label className={labelClass}>
          Nom de l'entreprise
          <input value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
        </label>
        <label className={labelClass}>
          Nom de la première équipe
          <input value={teamName} onChange={(e) => setTeamName(e.target.value)} required className={inputClass} />
        </label>
        <label className={labelClass}>
          Code d'équipe (pour l'inscription)
          <input
            value={teamCode}
            onChange={(e) => setTeamCode(e.target.value.toUpperCase())}
            required
            className={inputClass}
          />
        </label>
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={createCompany.isPending}>
            Créer
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Annuler
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function CompaniesPage() {
  const [creating, setCreating] = useState(false);
  const { data: companies, isLoading } = useQuery({
    queryKey: COMPANIES_QUERY_KEY,
    queryFn: () => api.get<Company[]>("/admin/companies"),
  });

  return (
    <div>
      <PageHeader
        title="Entreprises"
        subtitle="Gestion des entreprises clientes et de leurs équipes"
        actions={
          !creating && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              Nouvelle entreprise
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-4">
        {creating && <NewCompanyPanel onDone={() => setCreating(false)} />}
        {isLoading && <p className="text-sm text-slate-500">Chargement…</p>}
        {!isLoading && companies?.length === 0 && !creating && (
          <Card>
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Building2 className="h-8 w-8 text-slate-300" />
              <p className="text-sm text-slate-500">Aucune entreprise pour l'instant.</p>
            </div>
          </Card>
        )}
        {companies?.map((company) => (
          <CompanyCard key={company.id} company={company} />
        ))}
      </div>
    </div>
  );
}
