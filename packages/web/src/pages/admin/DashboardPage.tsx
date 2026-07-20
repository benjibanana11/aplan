import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarDays, ClipboardCheck, Users } from "lucide-react";
import { api } from "../../api/client";
import { PageHeader } from "../../components/PageHeader";
import { StatCard } from "../../components/StatCard";
import { Card } from "../../components/Card";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../components/Table";

interface PlanningBlock {
  id: string;
  employeeId: string;
  employeeName: string;
  taskId: string;
  taskName: string;
  startTime: string;
  endTime: string;
}

interface PlanningAlert {
  taskId: string;
  taskName: string;
  message: string;
}

interface Absence {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  reason: string | null;
  status: "PENDING" | "VALIDATED" | "REJECTED";
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function DashboardPage() {
  const date = today();

  const { data: blocks, isLoading: loadingBlocks } = useQuery({
    queryKey: ["planning", date],
    queryFn: () => api.get<PlanningBlock[]>(`/planning/${date}`),
  });

  const { data: staffingAlerts } = useQuery({
    queryKey: ["planning-alerts", date],
    queryFn: () => api.post<{ alerts: PlanningAlert[] }>("/planning/generate", { date }).then((r) => r.alerts),
  });

  const { data: absencesToday } = useQuery({
    queryKey: ["absences", date],
    queryFn: () => api.get<Absence[]>(`/absences?date=${date}`),
  });

  const blockedEmployeeIds = new Set((blocks ?? []).map((b) => b.employeeId));
  const unresolvedAbsences = (absencesToday ?? []).filter(
    (a) => a.status === "PENDING" || (a.status === "VALIDATED" && blockedEmployeeIds.has(a.employeeId))
  );

  const blocksByTask = new Map<string, PlanningBlock[]>();
  for (const block of blocks ?? []) {
    const list = blocksByTask.get(block.taskName) ?? [];
    list.push(block);
    blocksByTask.set(block.taskName, list);
  }

  const alertCount = (staffingAlerts?.length ?? 0) + unresolvedAbsences.length;
  const presentCount = blockedEmployeeIds.size;

  return (
    <div>
      <PageHeader title="Tableau de bord" subtitle={date} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Users} value={presentCount} label="Employés planifiés aujourd'hui" tone="blue" />
        <StatCard icon={ClipboardCheck} value={blocks?.length ?? 0} label="Blocs de tâches aujourd'hui" tone="green" />
        <StatCard icon={AlertTriangle} value={alertCount} label="Alertes à traiter" tone={alertCount > 0 ? "red" : "green"} />
      </div>

      <Card title={`Alertes${alertCount > 0 ? ` (${alertCount})` : ""}`}>
        {alertCount === 0 && <p className="text-sm text-slate-500">Aucune alerte pour aujourd'hui.</p>}
        {alertCount > 0 && (
          <ul className="space-y-2">
            {staffingAlerts?.map((alert, i) => (
              <li
                key={`staffing-${i}`}
                className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {alert.message}
              </li>
            ))}
            {unresolvedAbsences.map((absence) => (
              <li
                key={absence.id}
                className="flex items-start justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
              >
                <span className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {absence.status === "PENDING"
                    ? `Absence non traitée : ${absence.employeeName}${absence.reason ? ` (${absence.reason})` : ""}.`
                    : `Poste(s) non remplacé(s) suite à l'absence de ${absence.employeeName}.`}
                </span>
                <Link to="/admin/absences" className="shrink-0 font-medium text-red-700 hover:underline">
                  Traiter
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-6">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Planning du jour</h2>
        {loadingBlocks && <p className="text-sm text-slate-500">Chargement…</p>}
        {!loadingBlocks && (blocks?.length ?? 0) === 0 && (
          <Card>
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <CalendarDays className="h-4 w-4" />
              Aucun planning validé pour aujourd'hui.{" "}
              <Link to="/admin/planning" className="font-medium text-blue-600 hover:underline">
                Générer le planning
              </Link>
            </p>
          </Card>
        )}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from(blocksByTask.entries()).map(([taskName, taskBlocks]) => (
            <Card key={taskName} title={taskName}>
              <Table>
                <Thead>
                  <Tr>
                    <Th>Employé</Th>
                    <Th>Début</Th>
                    <Th>Fin</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {taskBlocks.map((block) => (
                    <Tr key={block.id}>
                      <Td>{block.employeeName}</Td>
                      <Td>{block.startTime}</Td>
                      <Td>{block.endTime}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
