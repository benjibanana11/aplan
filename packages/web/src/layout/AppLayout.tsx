import { useState } from "react";
import { Outlet, NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  CalendarDays,
  CalendarRange,
  GraduationCap,
  UserX,
  ChevronDown,
  CalendarClock,
  BarChart3,
  Settings,
  Check,
  LogOut,
  Building2,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { initials } from "../lib/initials";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const adminNavItems: NavItem[] = [
  { to: "/admin/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/admin/employees", label: "Employés", icon: Users },
  { to: "/admin/horaire", label: "Horaire", icon: CalendarRange },
  { to: "/admin/tasks", label: "Tâches", icon: ClipboardList },
  { to: "/admin/planning", label: "Planning", icon: CalendarDays },
  { to: "/admin/skills", label: "Formations", icon: GraduationCap },
  { to: "/admin/absences", label: "Absences", icon: UserX },
  { to: "/admin/stats", label: "Statistiques", icon: BarChart3 },
];

const employeeNavItems: NavItem[] = [
  { to: "/my-schedule", label: "Horaire", icon: CalendarClock },
  { to: "/my-planning", label: "Planning", icon: CalendarDays },
];

const settingsNavItem: NavItem = { to: "/settings", label: "Réglages", icon: Settings };
const companiesNavItem: NavItem = { to: "/admin/companies", label: "Entreprises", icon: Building2 };

function Sidebar() {
  const { user, logout, switchTeam } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  if (!user) return null;
  const items = [
    ...(user.role === "ADMIN" ? adminNavItems : employeeNavItems),
    ...(user.isSuperAdmin ? [companiesNavItem] : []),
    settingsNavItem,
  ];
  const hasMultipleTeams = user.teams.length > 1;

  async function handleSwitchTeam(teamId: string) {
    setMenuOpen(false);
    if (teamId === user!.teamId) return;
    await switchTeam(teamId);
  }

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col bg-slate-900 text-slate-300">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
          A
        </div>
        <span className="text-lg font-semibold text-white">Aplan</span>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <item.icon className={`h-4 w-4 ${isActive ? "text-blue-400" : ""}`} />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="relative border-t border-slate-800 p-3">
        <button
          onClick={() => (hasMultipleTeams ? setMenuOpen((v) => !v) : logout())}
          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-800/60"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-white">
            {initials(user.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user.name}</p>
            <p className="truncate text-xs text-slate-400">
              {user.role === "ADMIN" ? "Chef d'équipe" : "Employé"}
              {hasMultipleTeams ? ` · ${user.teamName}` : ""}
            </p>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
        </button>

        {menuOpen && (
          <div className="absolute bottom-full left-3 right-3 mb-2 rounded-lg border border-slate-700 bg-slate-800 py-1 shadow-lg">
            <p className="px-3 py-1.5 text-xs font-medium tracking-wide text-slate-500 uppercase">Changer d'équipe</p>
            {user.teams.map((team) => (
              <button
                key={team.teamId}
                type="button"
                onClick={() => handleSwitchTeam(team.teamId)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700"
              >
                <span className="truncate">
                  {team.teamName} <span className="text-slate-500">· {team.companyName}</span>
                </span>
                {team.teamId === user.teamId && <Check className="h-3.5 w-3.5 shrink-0 text-blue-400" />}
              </button>
            ))}
            <div className="mt-1 border-t border-slate-700 pt-1">
              <button
                type="button"
                onClick={() => logout()}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-400 hover:bg-slate-700"
              >
                <LogOut className="h-3.5 w-3.5" />
                Déconnexion
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="px-5 py-2 text-center text-[11px] text-slate-600">Créé par Benjamin Englebert, avec Claude</p>
    </aside>
  );
}

export function AppLayout() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Outlet />;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
