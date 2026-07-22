import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { PageHeader } from "../../components/PageHeader";
import { Card } from "../../components/Card";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../components/Table";
import { PlanningTimeline } from "../../components/PlanningTimeline";
import { today } from "../../lib/dates";

interface TodayScheduleEntry {
  date: string;
  startTime: string;
  endTime: string;
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

export function MyPlanningView() {
  const { user } = useAuth();
  const date = today();

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
      <PageHeader title="Planning" />

      <div>
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
