import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import type { SkillStatus } from "@aplan/shared";
import { api } from "../../api/client";
import { PageHeader } from "../../components/PageHeader";
import { Card } from "../../components/Card";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../components/Table";
import { inputClass, labelClass } from "../../components/formStyles";

interface Employee {
  id: string;
  name: string;
}

interface TaskOption {
  id: string;
  name: string;
}

interface Skill {
  employeeId: string;
  employeeName: string;
  taskId: string;
  taskName: string;
  status: SkillStatus;
  hoursCompleted: number;
  hoursRequired: number;
}

const statusLabels: Record<SkillStatus, string> = {
  EN_FORMATION: "En formation",
  FORME: "Formé",
  REFERENT: "Référent",
};

const statusTones: Record<SkillStatus, "amber" | "green" | "blue"> = {
  EN_FORMATION: "amber",
  FORME: "green",
  REFERENT: "blue",
};

function SkillCell({ skill }: { skill: Skill | undefined }) {
  if (!skill) return <span className="text-slate-300">—</span>;
  return (
    <Badge tone={statusTones[skill.status]}>
      {skill.status === "EN_FORMATION" ? `En formation (${skill.hoursCompleted}/${skill.hoursRequired}h)` : statusLabels[skill.status]}
    </Badge>
  );
}

export function SkillsMatrixPage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<{ employeeId: string; taskId: string } | null>(null);
  const [hoursRequiredInput, setHoursRequiredInput] = useState("20");
  const [hoursCompletedInput, setHoursCompletedInput] = useState("0");
  const [extraHours, setExtraHours] = useState("5");

  const { data: employees } = useQuery({ queryKey: ["employees"], queryFn: () => api.get<Employee[]>("/employees") });
  const { data: tasks } = useQuery({ queryKey: ["tasks"], queryFn: () => api.get<TaskOption[]>("/tasks") });
  const { data: skills } = useQuery({ queryKey: ["skills"], queryFn: () => api.get<Skill[]>("/skills") });

  const invalidateSkills = () => queryClient.invalidateQueries({ queryKey: ["skills"] });

  const createSkill = useMutation({
    mutationFn: (vars: { employeeId: string; taskId: string; hoursRequired: number }) => api.post("/skills", vars),
    onSuccess: invalidateSkills,
  });
  const updateSkill = useMutation({
    mutationFn: (vars: { employeeId: string; taskId: string; body: Record<string, unknown> }) =>
      api.patch(`/skills/${vars.employeeId}/${vars.taskId}`, vars.body),
    onSuccess: invalidateSkills,
  });
  const deleteSkill = useMutation({
    mutationFn: (vars: { employeeId: string; taskId: string }) => api.delete(`/skills/${vars.employeeId}/${vars.taskId}`),
    onSuccess: () => {
      invalidateSkills();
      setSelected(null);
    },
  });

  const skillFor = (employeeId: string, taskId: string) =>
    skills?.find((s) => s.employeeId === employeeId && s.taskId === taskId);

  function selectCell(employeeId: string, taskId: string) {
    setSelected({ employeeId, taskId });
    const existing = skillFor(employeeId, taskId);
    setHoursRequiredInput(String(existing?.hoursRequired ?? 20));
    setHoursCompletedInput(String(existing?.hoursCompleted ?? 0));
    setExtraHours("5");
  }

  const selectedSkill = selected ? skillFor(selected.employeeId, selected.taskId) : undefined;
  const selectedEmployee = employees?.find((e) => e.id === selected?.employeeId);
  const selectedTask = tasks?.find((t) => t.id === selected?.taskId);

  return (
    <div>
      <PageHeader title="Suivi des formations" subtitle="Statuts de compétence par employé et par tâche" />

      <div className="flex items-start gap-6">
        <div className="min-w-0 flex-1">
          <Card>
            <Table>
              <Thead>
                <Tr>
                  <Th></Th>
                  {tasks?.map((task) => (
                    <Th key={task.id}>{task.name}</Th>
                  ))}
                </Tr>
              </Thead>
              <Tbody>
                {employees?.map((employee) => (
                  <Tr key={employee.id}>
                    <Td className="font-medium text-slate-900">{employee.name}</Td>
                    {tasks?.map((task) => (
                      <Td key={task.id}>
                        <button
                          onClick={() => selectCell(employee.id, task.id)}
                          className="rounded p-1 hover:bg-slate-100"
                        >
                          <SkillCell skill={skillFor(employee.id, task.id)} />
                        </button>
                      </Td>
                    ))}
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Card>
        </div>

        {selected && (
          <div className="sticky top-6 w-80 shrink-0 self-start">
            <Card
              title={`${selectedEmployee?.name} — ${selectedTask?.name}`}
              actions={
                <button
                  onClick={() => setSelected(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Fermer"
                >
                  <X className="h-4 w-4" />
                </button>
              }
            >
              {!selectedSkill && (
                <div className="flex flex-col gap-4">
                  <label className={labelClass}>
                    Heures requises
                    <input
                      type="number"
                      min={0}
                      value={hoursRequiredInput}
                      onChange={(e) => setHoursRequiredInput(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <Button
                    variant="primary"
                    onClick={() =>
                      createSkill.mutate({
                        employeeId: selected.employeeId,
                        taskId: selected.taskId,
                        hoursRequired: Number(hoursRequiredInput),
                      })
                    }
                  >
                    Créer (en formation)
                  </Button>
                </div>
              )}

              {selectedSkill && (
                <div className="flex flex-col gap-4">
                  <label className={labelClass}>
                    Statut
                    <select
                      value={selectedSkill.status}
                      onChange={(e) =>
                        updateSkill.mutate({
                          employeeId: selected.employeeId,
                          taskId: selected.taskId,
                          body: { status: e.target.value },
                        })
                      }
                      className={inputClass}
                    >
                      <option value="EN_FORMATION">En formation</option>
                      <option value="FORME">Formé</option>
                      <option value="REFERENT">Référent</option>
                    </select>
                  </label>
                  <label className={labelClass}>
                    Heures effectuées
                    <input
                      type="number"
                      min={0}
                      value={hoursCompletedInput}
                      onChange={(e) => setHoursCompletedInput(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <label className={labelClass}>
                    Heures requises
                    <input
                      type="number"
                      min={0}
                      value={hoursRequiredInput}
                      onChange={(e) => setHoursRequiredInput(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      updateSkill.mutate({
                        employeeId: selected.employeeId,
                        taskId: selected.taskId,
                        body: { hoursCompleted: Number(hoursCompletedInput), hoursRequired: Number(hoursRequiredInput) },
                      })
                    }
                  >
                    Enregistrer les heures
                  </Button>

                  {selectedSkill.status === "EN_FORMATION" && (
                    <div className="flex flex-col gap-3 border-t border-slate-100 pt-4">
                      <Button
                        variant="primary"
                        onClick={() =>
                          updateSkill.mutate({
                            employeeId: selected.employeeId,
                            taskId: selected.taskId,
                            body: { status: "FORME" },
                          })
                        }
                      >
                        Valider comme Formé
                      </Button>
                      <label className={labelClass}>
                        Refuser, heures supplémentaires requises
                        <input
                          type="number"
                          min={1}
                          value={extraHours}
                          onChange={(e) => setExtraHours(e.target.value)}
                          className={inputClass}
                        />
                      </label>
                      <Button
                        variant="danger"
                        onClick={() =>
                          updateSkill.mutate({
                            employeeId: selected.employeeId,
                            taskId: selected.taskId,
                            body: { hoursRequired: selectedSkill.hoursRequired + Number(extraHours) },
                          })
                        }
                      >
                        Refuser
                      </Button>
                    </div>
                  )}

                  {selectedSkill.status === "FORME" && (
                    <Button
                      variant="primary"
                      onClick={() =>
                        updateSkill.mutate({
                          employeeId: selected.employeeId,
                          taskId: selected.taskId,
                          body: { status: "REFERENT" },
                        })
                      }
                    >
                      Promouvoir Référent
                    </Button>
                  )}

                  <Button
                    variant="danger"
                    onClick={() => deleteSkill.mutate({ employeeId: selected.employeeId, taskId: selected.taskId })}
                  >
                    Supprimer
                  </Button>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
