import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Role } from "@aplan/shared";
import { api, ApiError } from "../api/client";

export interface TeamOption {
  companyId: string;
  companyName: string;
  teamId: string;
  teamName: string;
  role: Role;
}

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  isSuperAdmin: boolean;
  role: Role;
  companyId: string;
  companyName: string;
  teamId: string;
  teamName: string;
  teams: TeamOption[];
}

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  pendingTeams: TeamOption[] | null;
  /** Renvoie true si un choix d'équipe est requis (voir pendingTeams) avant que la connexion ne soit finalisée. */
  login: (email: string, password: string) => Promise<boolean>;
  selectTeam: (teamId: string) => Promise<void>;
  switchTeam: (teamId: string) => Promise<void>;
  register: (teamCode: string, name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [pendingTeams, setPendingTeams] = useState<TeamOption[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<CurrentUser>("/auth/me")
      .then(setUser)
      .catch((error) => {
        if (!(error instanceof ApiError && error.status === 401)) {
          console.error(error);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string): Promise<boolean> {
    const result = await api.post<CurrentUser | { needsTeamSelection: true; teams: TeamOption[] }>("/auth/login", {
      email,
      password,
    });
    if ("needsTeamSelection" in result) {
      setPendingTeams(result.teams);
      return true;
    }
    setUser(result);
    setPendingTeams(null);
    return false;
  }

  async function selectTeam(teamId: string) {
    const loggedIn = await api.post<CurrentUser>("/auth/select-team", { teamId });
    setUser(loggedIn);
    setPendingTeams(null);
  }

  async function switchTeam(teamId: string) {
    const updated = await api.post<CurrentUser>("/auth/switch-team", { teamId });
    setUser(updated);
  }

  async function register(teamCode: string, name: string, email: string, password: string) {
    const created = await api.post<CurrentUser>("/auth/register", { teamCode, name, email, password });
    setUser(created);
  }

  async function logout() {
    await api.post("/auth/logout");
    setUser(null);
    setPendingTeams(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, pendingTeams, login, selectTeam, switchTeam, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans un AuthProvider");
  return ctx;
}
