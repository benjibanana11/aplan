import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { PageHeader } from "../../components/PageHeader";
import { Card } from "../../components/Card";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../components/Table";
import { inputClass } from "../../components/formStyles";
import { currentMonth, today } from "../../lib/dates";

interface HistoryDay {
  date: string;
  employeeCount: number;
  blockCount: number;
}

interface StatsResponse {
  employees: { id: string; name: string }[];
  tasks: { id: string; name: string }[];
  counts: { employeeId: string; taskId: string; count: number }[];
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function StatsPage() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(currentMonth());
  const [from, setFrom] = useState(addDays(today(), -90));
  const [to, setTo] = useState(today());

  const { data: history, isLoading: loadingHistory } = useQuery({
    queryKey: ["planning-history", month],
    queryFn: () => api.get<HistoryDay[]>(`/planning/history?month=${month}`),
  });

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ["planning-stats", from, to],
    queryFn: () => api.get<StatsResponse>(`/planning/stats?from=${from}&to=${to}`),
  });

  const countFor = (employeeId: string, taskId: string) =>
    stats?.counts.find((c) => c.employeeId === employeeId && c.taskId === taskId)?.count ?? 0;

  return (
    <div>
      <PageHeader title="Statistiques" subtitle="Historique des plannings générés et équité entre employés" />

      <div className="mb-6">
        <Card
          title="Répartition des tâches par employé"
          actions={
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <label className="flex items-center gap-2">
                Du
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
              </label>
              <label className="flex items-center gap-2">
                Au
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
              </label>
            </div>
          }
        >
          {loadingStats && <p className="text-sm text-slate-500">Chargement…</p>}
          {!loadingStats && stats && stats.employees.length === 0 && (
            <p className="text-sm text-slate-500">Aucun employé.</p>
          )}
          {!loadingStats && stats && stats.employees.length > 0 && (
            <Table>
              <Thead>
                <Tr>
                  <Th className="sticky left-0 z-10 bg-white">Employé</Th>
                  {stats.tasks.map((task) => (
                    <Th key={task.id} className="text-center">
                      {task.name}
                    </Th>
                  ))}
                </Tr>
              </Thead>
              <Tbody>
                {stats.employees.map((employee) => (
                  <Tr key={employee.id} className="hover:bg-slate-50">
                    <Td className="sticky left-0 z-10 whitespace-nowrap bg-white font-medium text-slate-900">
                      {employee.name}
                    </Td>
                    {stats.tasks.map((task) => {
                      const count = countFor(employee.id, task.id);
                      return (
                        <Td key={task.id} className={`text-center ${count === 0 ? "text-slate-300" : "text-slate-700"}`}>
                          {count || "—"}
                        </Td>
                      );
                    })}
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </Card>
      </div>

      <Card
        title="Historique des plannings"
        actions={
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Mois
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputClass} />
          </label>
        }
      >
        {loadingHistory && <p className="text-sm text-slate-500">Chargement…</p>}
        {!loadingHistory && history && history.length === 0 && (
          <p className="text-sm text-slate-500">Aucun planning enregistré ce mois-ci.</p>
        )}
        {!loadingHistory && history && history.length > 0 && (
          <Table>
            <Thead>
              <Tr>
                <Th>Date</Th>
                <Th>Employés planifiés</Th>
                <Th>Blocs</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody>
              {history.map((day) => (
                <Tr key={day.date} className="hover:bg-slate-50">
                  <Td className="font-medium text-slate-900">{day.date}</Td>
                  <Td>{day.employeeCount}</Td>
                  <Td>{day.blockCount}</Td>
                  <Td>
                    <button
                      onClick={() => navigate(`/admin/planning?date=${day.date}`)}
                      className="text-sm font-medium text-blue-600 hover:text-blue-800"
                    >
                      Voir le planning
                    </button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
