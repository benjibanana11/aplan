import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { PageHeader } from "../../components/PageHeader";
import { Card } from "../../components/Card";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../components/Table";
import { inputClass } from "../../components/formStyles";
import { PlanningTimeline } from "../../components/PlanningTimeline";

interface WorkScheduleEntry {
  date: string;
  startTime: string;
  endTime: string;
}

interface TodayScheduleEntry extends WorkScheduleEntry {
  employee: { id: string; name: string };
}

interface PlanningBlock {
  id: string;
  employeeId: string;
  employeeName: string;
  taskId: string;
  taskName: string;
  startTime: string;
  endTime: string;
  isTraining: boolean;
  trainerName: string | null;
}

interface TaskOption {
  id: string;
  name: string;
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function MyScheduleView() {
  const { user } = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const date = today();

  const { data: myEntries } = useQuery({
    queryKey: ["schedule", user?.id, month],
    queryFn: () => api.get<WorkScheduleEntry[]>(`/schedules/${user!.id}?month=${month}`),
    enabled: Boolean(user),
  });

  const { data: scheduleToday } = useQuery({
    queryKey: ["schedule-today"],
    queryFn: () => api.get<TodayScheduleEntry[]>("/schedules/today"),
  });

  const { data: planningToday } = useQuery({
    queryKey: ["planning", date],
    queryFn: () => api.get<PlanningBlock[]>(`/planning/${date}`),
  });

  const { data: tasks } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => api.get<TaskOption[]>("/tasks"),
  });

  const myBlocksToday = planningToday?.filter((b) => b.employeeId === user?.id) ?? [];

  return (
    <div>
      <PageHeader
        title="Mon horaire"
        actions={
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Mois
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputClass} />
          </label>
        }
      />

      <Card title="Mes horaires du mois">
        <div className="max-h-72 overflow-y-auto">
          <Table>
            <Thead>
              <Tr>
                <Th>Date</Th>
                <Th>Début</Th>
                <Th>Fin</Th>
              </Tr>
            </Thead>
            <Tbody>
              {myEntries?.map((entry) => (
                <Tr key={entry.date}>
                  <Td>{entry.date.slice(0, 10)}</Td>
                  <Td>{entry.startTime}</Td>
                  <Td>{entry.endTime}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      </Card>

      <div className="mt-6">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Mes tâches aujourd'hui</h2>
        <Card>
          {myBlocksToday.length === 0 && (
            <p className="text-sm text-slate-500">Aucune tâche assignée pour aujourd'hui pour le moment.</p>
          )}
          {myBlocksToday.length > 0 && (
            <Table>
              <Thead>
                <Tr>
                  <Th>Début</Th>
                  <Th>Fin</Th>
                  <Th>Tâche</Th>
                </Tr>
              </Thead>
              <Tbody>
                {myBlocksToday.map((block) => (
                  <Tr key={block.id}>
                    <Td>{block.startTime}</Td>
                    <Td>{block.endTime}</Td>
                    <Td className="font-medium text-slate-900">{block.taskName}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </Card>
      </div>

      <div className="mt-6">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Planning complet de l'équipe aujourd'hui</h2>
        <Card>
          {(!planningToday || planningToday.length === 0) && (
            <>
              <p className="mb-3 flex items-center gap-2 text-sm text-slate-500">
                <Users className="h-4 w-4" />
                Le planning détaillé n'a pas encore été validé pour aujourd'hui. Horaires de présence de l'équipe :
              </p>
              <Table>
                <Thead>
                  <Tr>
                    <Th>Employé</Th>
                    <Th>Début</Th>
                    <Th>Fin</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {scheduleToday?.map((entry) => (
                    <Tr key={`${entry.employee.id}-${entry.startTime}`}>
                      <Td>{entry.employee.name}</Td>
                      <Td>{entry.startTime}</Td>
                      <Td>{entry.endTime}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </>
          )}
          {planningToday && planningToday.length > 0 && (
            <PlanningTimeline blocks={planningToday} taskOrder={tasks?.map((t) => t.id) ?? []} />
          )}
        </Card>
      </div>
    </div>
  );
}
