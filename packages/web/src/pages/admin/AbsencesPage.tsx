import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserX, AlertTriangle } from "lucide-react";
import { api } from "../../api/client";
import { PageHeader } from "../../components/PageHeader";
import { Card } from "../../components/Card";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../components/Table";
import { inputClass, labelClass } from "../../components/formStyles";
import { useScrollIntoView } from "../../lib/useScrollIntoView";

interface Employee {
  id: string;
  name: string;
}

interface PreviousAssignment {
  taskId: string;
  taskName: string;
  startTime: string;
  endTime: string;
}

interface Absence {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  reason: string | null;
  status: "PENDING" | "VALIDATED" | "REJECTED";
  suggestedReplacementUserId: string | null;
  suggestedReplacementName: string | null;
  /** true si un planning était déjà validé pour ce jour : il a été recalculé automatiquement,
   * donc previousAssignments est la seule trace de ce sur quoi la personne était affectée. */
  recalculated: boolean;
  previousAssignments: PreviousAssignment[] | null;
}

interface Suggestion {
  taskId: string;
  taskName: string;
  startTime: string;
  endTime: string;
  suggestedReplacementUserId: string | null;
  suggestedReplacementName: string | null;
  reason: string;
}

const statusLabels: Record<Absence["status"], string> = {
  PENDING: "En attente",
  VALIDATED: "Validée",
  REJECTED: "Rejetée",
};

const statusTones: Record<Absence["status"], "amber" | "green" | "red"> = {
  PENDING: "amber",
  VALIDATED: "green",
  REJECTED: "red",
};

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function AbsencesPage() {
  const queryClient = useQueryClient();
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState("");
  const [selectedAbsenceId, setSelectedAbsenceId] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, string>>({}); // taskId -> replacementUserId or ""

  const { data: employees } = useQuery({ queryKey: ["employees"], queryFn: () => api.get<Employee[]>("/employees") });
  const { data: absences } = useQuery({ queryKey: ["absences"], queryFn: () => api.get<Absence[]>("/absences") });
  const selectedAbsence = absences?.find((a) => a.id === selectedAbsenceId);
  const { data: suggestions } = useQuery({
    queryKey: ["absence-suggestions", selectedAbsenceId],
    queryFn: () => api.get<Suggestion[]>(`/absences/${selectedAbsenceId}/suggestions`),
    // Un planning déjà validé est recalculé automatiquement à la déclaration (voir POST /absences) :
    // il n'y a alors plus de poste vacant à suggérer, previousAssignments (ci-dessous) le remplace.
    enabled: Boolean(selectedAbsenceId) && !selectedAbsence?.recalculated,
  });

  const invalidateAbsences = () => queryClient.invalidateQueries({ queryKey: ["absences"] });

  const declare = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>("/absences", { employeeId, date, reason: reason || undefined }),
    onSuccess: (created) => {
      invalidateAbsences();
      setReason("");
      setSelectedAbsenceId(created.id);
      setDecisions({});
    },
  });

  const resolve = useMutation({
    mutationFn: (vars: {
      id: string;
      decisions: { taskId: string; startTime: string; endTime: string; replacementUserId: string | null }[];
    }) => api.post(`/absences/${vars.id}/resolve`, { decisions: vars.decisions }),
    onSuccess: () => {
      invalidateAbsences();
      setSelectedAbsenceId(null);
    },
  });

  const reject = useMutation({
    mutationFn: (id: string) => api.post(`/absences/${id}/reject`),
    onSuccess: () => {
      invalidateAbsences();
      setSelectedAbsenceId(null);
    },
  });

  function selectAbsence(absence: Absence) {
    setSelectedAbsenceId(absence.id);
    setDecisions({});
  }

  function decisionKey(suggestion: Suggestion) {
    return `${suggestion.taskId}:${suggestion.startTime}`;
  }

  function decisionFor(suggestion: Suggestion) {
    return decisions[decisionKey(suggestion)] ?? suggestion.suggestedReplacementUserId ?? "";
  }

  function submitResolve() {
    if (!selectedAbsenceId) return;
    // Planning déjà recalculé automatiquement (voir POST /absences) : rien à décider par tâche,
    // "Valider" ne fait alors qu'acter l'absence elle-même.
    if (selectedAbsence?.recalculated) {
      resolve.mutate({ id: selectedAbsenceId, decisions: [] });
      return;
    }
    if (!suggestions) return;
    resolve.mutate({
      id: selectedAbsenceId,
      decisions: suggestions.map((s) => ({
        taskId: s.taskId,
        startTime: s.startTime,
        endTime: s.endTime,
        replacementUserId: decisionFor(s) || null,
      })),
    });
  }

  const panelRef = useScrollIntoView<HTMLDivElement>(selectedAbsenceId);

  return (
    <div>
      <PageHeader title="Absences" subtitle="Déclarez une absence et validez les remplacements suggérés" />

      <Card title="Déclarer une absence">
        <div className="flex flex-wrap items-end gap-4">
          <label className={labelClass}>
            Employé
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={inputClass}>
              <option value="">—</option>
              {employees?.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </label>
          <label className={labelClass}>
            Motif (optionnel)
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
          </label>
          <Button variant="primary" onClick={() => declare.mutate()} disabled={!employeeId || declare.isPending}>
            Déclarer
          </Button>
        </div>
      </Card>

      <div className="my-6 flex items-start gap-6">
        <div className="min-w-0 flex-1">
          <Card title="Liste des absences">
            <Table>
              <Thead>
                <Tr>
                  <Th>Date</Th>
                  <Th>Employé</Th>
                  <Th>Motif</Th>
                  <Th>Statut</Th>
                  <Th>Remplaçant suggéré</Th>
                  <Th></Th>
                </Tr>
              </Thead>
              <Tbody>
                {absences?.map((absence) => (
                  <Tr key={absence.id} className={absence.id === selectedAbsenceId ? "bg-blue-50" : "hover:bg-slate-50"}>
                    <Td>{absence.date}</Td>
                    <Td className="font-medium text-slate-900">{absence.employeeName}</Td>
                    <Td>{absence.reason ?? "—"}</Td>
                    <Td>
                      <Badge tone={statusTones[absence.status]}>{statusLabels[absence.status]}</Badge>
                    </Td>
                    <Td>{absence.suggestedReplacementName ?? "Aucun"}</Td>
                    <Td>
                      <Button variant="secondary" onClick={() => selectAbsence(absence)}>
                        Traiter
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Card>
        </div>

        {selectedAbsence && (
          <div ref={panelRef} className="w-[28rem] shrink-0 scroll-mt-6">
            <Card title={`Absence de ${selectedAbsence.employeeName} — ${selectedAbsence.date}`}>
              {selectedAbsence.previousAssignments && selectedAbsence.previousAssignments.length > 0 && (
                <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <p className="mb-1 font-medium text-slate-700">
                    {selectedAbsence.employeeName} était affecté(e) à :
                  </p>
                  <ul className="space-y-0.5 text-slate-600">
                    {selectedAbsence.previousAssignments.map((a) => (
                      <li key={`${a.taskId}:${a.startTime}`}>
                        {a.startTime}–{a.endTime} · {a.taskName}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedAbsence.recalculated && (
                <p className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Le planning de ce jour était déjà validé — il a été recalculé automatiquement pour
                  exclure {selectedAbsence.employeeName}. Vérifiez-le et revalidez-le sur la page Planning.
                </p>
              )}

              {!selectedAbsence.recalculated && suggestions && suggestions.length === 0 && (
                <p className="flex items-center gap-2 text-sm text-slate-500">
                  <UserX className="h-4 w-4" />
                  Aucun poste vacant : aucun planning validé n'existe pour ce jour.
                </p>
              )}

              {!selectedAbsence.recalculated && suggestions && suggestions.length > 0 && (
                <Table>
                  <Thead>
                    <Tr>
                      <Th>Créneau</Th>
                      <Th>Tâche</Th>
                      <Th>Remplaçant</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {suggestions.map((s) => (
                      <Tr key={decisionKey(s)}>
                        <Td className="whitespace-nowrap">
                          {s.startTime}–{s.endTime}
                        </Td>
                        <Td>{s.taskName}</Td>
                        <Td>
                          <select
                            value={decisionFor(s)}
                            onChange={(e) =>
                              setDecisions((prev) => ({ ...prev, [decisionKey(s)]: e.target.value }))
                            }
                            className={inputClass}
                          >
                            <option value="">Aucun remplacement</option>
                            {employees
                              ?.filter((emp) => emp.id !== selectedAbsence.employeeId)
                              .map((emp) => (
                                <option key={emp.id} value={emp.id}>
                                  {emp.name}
                                </option>
                              ))}
                          </select>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              )}

              <div className="mt-4 flex gap-2">
                <Button variant="primary" onClick={submitResolve} disabled={resolve.isPending}>
                  Valider
                </Button>
                <Button variant="danger" onClick={() => reject.mutate(selectedAbsence.id)} disabled={reject.isPending}>
                  Rejeter
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
