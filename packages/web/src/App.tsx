import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { RequireAuth, RequireRole, RequireSuperAdmin } from "./auth/RequireRole";
import { AppLayout } from "./layout/AppLayout";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { TeamSelect } from "./pages/TeamSelect";
import { DashboardPage } from "./pages/admin/DashboardPage";
import { EmployeesPage } from "./pages/admin/EmployeesPage";
import { MonthlyScheduleGrid } from "./pages/admin/MonthlyScheduleGrid";
import { HoraireMatrixPage } from "./pages/admin/HoraireMatrixPage";
import { TasksPage } from "./pages/admin/TasksPage";
import { PlanningGenerationPage } from "./pages/admin/PlanningGenerationPage";
import { SkillsMatrixPage } from "./pages/admin/SkillsMatrixPage";
import { AbsencesPage } from "./pages/admin/AbsencesPage";
import { StatsPage } from "./pages/admin/StatsPage";
import { CompaniesPage } from "./pages/admin/CompaniesPage";
import { MyScheduleView } from "./pages/employee/MyScheduleView";
import { SettingsPage } from "./pages/SettingsPage";

function Home() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "ADMIN") return <Navigate to="/admin/dashboard" replace />;
  return <Navigate to="/my-schedule" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/select-team" element={<TeamSelect />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<Home />} />
        <Route
          path="/admin/dashboard"
          element={
            <RequireRole role="ADMIN">
              <DashboardPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/employees"
          element={
            <RequireRole role="ADMIN">
              <EmployeesPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/employees/:employeeId/schedule"
          element={
            <RequireRole role="ADMIN">
              <MonthlyScheduleGrid />
            </RequireRole>
          }
        />
        <Route
          path="/admin/horaire"
          element={
            <RequireRole role="ADMIN">
              <HoraireMatrixPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/tasks"
          element={
            <RequireRole role="ADMIN">
              <TasksPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/planning"
          element={
            <RequireRole role="ADMIN">
              <PlanningGenerationPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/skills"
          element={
            <RequireRole role="ADMIN">
              <SkillsMatrixPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/absences"
          element={
            <RequireRole role="ADMIN">
              <AbsencesPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/stats"
          element={
            <RequireRole role="ADMIN">
              <StatsPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin/companies"
          element={
            <RequireSuperAdmin>
              <CompaniesPage />
            </RequireSuperAdmin>
          }
        />
        <Route
          path="/my-schedule"
          element={
            <RequireAuth>
              <MyScheduleView />
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <SettingsPage />
            </RequireAuth>
          }
        />
      </Route>
    </Routes>
  );
}
