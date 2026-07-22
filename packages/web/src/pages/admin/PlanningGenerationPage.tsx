import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Download, List, Sparkles, GanttChartSquare } from "lucide-react";
import { api, API_URL } from "../../api/client";
import { PageHeader } from "../../components/PageHeader";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Badge } from "../../components/Badge";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../components/Table";
import { inputClass, labelClass } from "../../components/formStyles";
import { PlanningTimeline } from "../../components/PlanningTimeline";

interface PlanningAlert {
  taskId: string;
  taskName: string;
  message: string;
}

interface PlanningBlock {
  id?: string;
  employeeId: string;
  employeeName: string;
  taskId: string;
  taskName: string;
  startTime: string;
  endTime: string;
  source: "GENERATED" | "MANUAL";
  justification: string;
  isTraining: boolean;
  trainerName: string | null;
  needsRevalidation?: boolean;
}

interface TaskOption {
  id: string;
  name: string;
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function PlanningGenerationPage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const dateParam = searchParams.get("date");
  const [date, setDate] = useState(
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today()
  );
  const [exportMonth, setExportMonth] = useState(today().slice(0, 7));
  const [blocks, setBlocks] = useState<PlanningBlock[] | null>(null);
  const [alerts, setAlerts] = useState<PlanningAlert[]>([]);
  const [validated, setValidated] = useState(false);
  const [view, setView] = useState<"timeline" | "liste">("timeline");

  const { data: tasks } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => api.get<TaskOption[]>("/tasks"),
  });

  const { data: persisted } = useQuery({
    queryKey: ["planning", date],
    queryFn: () => api.get<PlanningBlock[]>(`/planning/${date}`),
  });

  useEffect(() => {
    setBlocks(null);
    setAlerts([]);
    setValidated(false);
  }, [date]);

  useEffect(() => {
    if (persisted && persisted.length > 0 && blocks === null) {
      setBlocks(persisted);
      setValidated(!persisted.some((b) => b.needsRevalidation));
    }
  }, [persisted, blocks]);

  const needsRevalidation = blocks !== null && blocks.some((b) => b.needsRevalidation);

  const generate = useMutation({
    mutationFn: () => api.post<{ blocks: PlanningBlock[]; alerts: PlanningAlert[] }>("/planning/generate", { date }),
    onSuccess: (result) => {
      setBlocks(result.blocks);
      setAlerts(result.alerts);
      setValidated(false);
    },
  });

  const validate = useMutation({
    mutationFn: () => api.post<PlanningBlock[]>("/planning/validate", { date, blocks }),
    onSuccess: (saved) => {
      setBlocks(saved);
      setValidated(true);
      queryClient.invalidateQueries({ queryKey: ["planning", date] });
    },
  });

  function changeBlockTask(index: number, taskId: string) {
    if (!blocks || !tasks) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    setBlocks(
      blocks.map((b, i) =>
        i === index
          ? {
              ...b,
              taskId,
              taskName: task.name,
              source: "MANUAL",
              justification: "Affectation modifiée manuellement par l'administrateur.",
              isTraining: false,
              trainerName: null,
            }
          : b
      )
    );
    setValidated(false);
  }

  const blocksByEmployee = new Map<string, PlanningBlock[]>();
  for (const block of blocks ?? []) {
    const list = blocksByEmployee.get(block.employeeId) ?? [];
    list.push(block);
    blocksByEmployee.set(block.employeeId, list);
  }

  return (
    <div>
      <PageHeader
        title="Génération du planning"
        subtitle="Générez, ajustez et validez l'affectation des tâches par jour"
        actions={
          <>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              Date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </label>
            <Button variant="secondary" onClick={() => generate.mutate()} disabled={generate.isPending}>
              <Sparkles className="h-4 w-4" />
              Générer
            </Button>
            {blocks && blocks.length > 0 && (
              <Button variant="primary" onClick={() => validate.mutate()} disabled={validate.isPending}>
                Valider
              </Button>
            )}
          </>
        }
      />

      {validated && (
        <p className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          Planning validé et enregistré pour le {date}.
        </p>
      )}

      {needsRevalidation && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Ce planning a été recalculé automatiquement suite à une absence et doit être revérifié puis revalidé.
        </p>
      )}

      {alerts.length > 0 && (
        <Card title="Alertes">
          <ul className="space-y-2">
            {alerts.map((alert, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {alert.message}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {blocks === null && (
        <Card>
          <p className="text-sm text-slate-500">Aucun planning généré ou enregistré pour cette date.</p>
        </Card>
      )}
      {blocks !== null && blocks.length === 0 && (
        <Card>
          <p className="text-sm text-slate-500">Aucun employé n'est prévu ce jour-là.</p>
        </Card>
      )}

      {blocks !== null && blocks.length > 0 && (
        <div className="my-6">
          <div className="mb-3 inline-flex rounded-lg border border-slate-200 bg-white p-1">
            <button
              onClick={() => setView("liste")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
                view === "liste" ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <List className="h-4 w-4" />
              Liste
            </button>
            <button
              onClick={() => setView("timeline")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
                view === "timeline" ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <GanttChartSquare className="h-4 w-4" />
              Timeline
            </button>
          </div>

          {view === "timeline" && (
            <Card>
              <PlanningTimeline
                blocks={blocks}
                taskOrder={tasks?.map((t) => t.id) ?? []}
                tasks={tasks}
                onChangeTask={changeBlockTask}
              />
            </Card>
          )}

          {view === "liste" && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {Array.from(blocksByEmployee.entries()).map(([employeeId, employeeBlocks]) => (
                <Card key={employeeId} title={employeeBlocks[0].employeeName}>
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>Début</Th>
                        <Th>Fin</Th>
                        <Th>Tâche</Th>
                        <Th>Justification</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {employeeBlocks.map((block) => {
                        const index = blocks!.indexOf(block);
                        return (
                          <Tr key={index}>
                            <Td>{block.startTime}</Td>
                            <Td>{block.endTime}</Td>
                            <Td>
                              <div className="flex items-center gap-2">
                                <select
                                  value={block.taskId}
                                  onChange={(e) => changeBlockTask(index, e.target.value)}
                                  className={inputClass}
                                >
                                  {tasks?.map((task) => (
                                    <option key={task.id} value={task.id}>
                                      {task.name}
                                    </option>
                                  ))}
                                </select>
                                {block.source === "MANUAL" && <Badge tone="purple">Modifié</Badge>}
                                {block.isTraining && (
                                  <Badge tone="amber">
                                    En formation{block.trainerName ? ` · avec ${block.trainerName}` : ""}
                                  </Badge>
                                )}
                              </div>
                            </Td>
                            <Td className="max-w-xs text-slate-500">{block.justification}</Td>
                          </Tr>
                        );
                      })}
                    </Tbody>
                  </Table>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      <Card title="Export">
        <div className="flex items-end gap-3">
          <label className={labelClass}>
            Mois à exporter
            <input
              type="month"
              value={exportMonth}
              onChange={(e) => setExportMonth(e.target.value)}
              className={inputClass}
            />
          </label>
          <a
            href={`${API_URL}/planning/export?month=${exportMonth}`}
            download={`planning-${exportMonth}.csv`}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Exporter en CSV
          </a>
        </div>
      </Card>
    </div>
  );
}
