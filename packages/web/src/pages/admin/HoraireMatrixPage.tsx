import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api, ApiError } from "../../api/client";
import { PageHeader } from "../../components/PageHeader";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../components/Table";
import { inputClass, labelClass } from "../../components/formStyles";
import { currentMonth, daysInMonth, isWeekend, weekdayLetter } from "../../lib/dates";
import { formatTimeCompact } from "../../lib/time";

interface Employee {
  id: string;
  name: string;
}

interface ScheduleEntry {
  employeeId: string;
  employeeName: string;
  date: string;
  startTime: string;
  endTime: string;
}

interface AbsenceEntry {
  employeeId: string;
  date: string;
  reason: string | null;
}

export function HoraireMatrixPage() {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(currentMonth());
  const [selected, setSelected] = useState<{ employeeId: string; employeeName: string; date: string } | null>(null);
  const [startTimeInput, setStartTimeInput] = useState("08:00");
  const [endTimeInput, setEndTimeInput] = useState("16:00");
  const [error, setError] = useState<string | null>(null);

  const { data: employees, isLoading: loadingEmployees } = useQuery({
    queryKey: ["employees"],
    queryFn: () => api.get<Employee[]>("/employees"),
  });
  const { data, isLoading: loadingSchedule } = useQuery({
    queryKey: ["schedules-month", month],
    queryFn: () => api.get<{ entries: ScheduleEntry[]; absences: AbsenceEntry[] }>(`/schedules?month=${month}`),
  });
  const entries = data?.entries;
  const absences = data?.absences;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["schedules-month", month] });

  const saveDay = useMutation({
    mutationFn: (vars: { employeeId: string; date: string; startTime: string; endTime: string }) =>
      api.put(`/schedules/${vars.employeeId}/${vars.date}`, { startTime: vars.startTime, endTime: vars.endTime }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Erreur lors de l'enregistrement"),
  });

  const clearDay = useMutation({
    mutationFn: (vars: { employeeId: string; date: string }) =>
      api.delete(`/schedules/${vars.employeeId}/${vars.date}`),
    onSuccess: () => {
      setError(null);
      setSelected(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Erreur lors de la suppression"),
  });

  const days = daysInMonth(month);
  const entryFor = (employeeId: string, date: string) =>
    entries?.find((e) => e.employeeId === employeeId && e.date.slice(0, 10) === date);
  const absenceFor = (employeeId: string, date: string) =>
    absences?.find((a) => a.employeeId === employeeId && a.date.slice(0, 10) === date);

  function selectCell(employeeId: string, employeeName: string, date: string) {
    setSelected({ employeeId, employeeName, date });
    setError(null);
    const existing = entryFor(employeeId, date);
    setStartTimeInput(existing?.startTime ?? "08:00");
    setEndTimeInput(existing?.endTime ?? "16:00");
  }

  const isLoading = loadingEmployees || loadingSchedule;

  return (
    <div>
      <PageHeader
        title="Horaire"
        subtitle="Horaire mensuel de toute l'équipe, modifiable directement"
        actions={
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Mois
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputClass} />
          </label>
        }
      />

      <div className="flex items-start gap-6">
        <div className="min-w-0 flex-1">
          <Card>
            {isLoading && <p className="text-sm text-slate-500">Chargement…</p>}
            {!isLoading && (
              <Table>
                <Thead>
                  <Tr>
                    <Th className="sticky left-0 z-10 bg-white">Employé</Th>
                    {days.map((day) => (
                      <Th
                        key={day}
                        className={`text-center ${isWeekend(day) ? "bg-slate-50" : ""}`}
                      >
                        <div>{Number(day.slice(-2))}</div>
                        <div className="font-normal normal-case text-slate-400">{weekdayLetter(day)}</div>
                      </Th>
                    ))}
                  </Tr>
                </Thead>
                <Tbody>
                  {employees?.map((employee) => (
                    <Tr key={employee.id} className="hover:bg-slate-50">
                      <Td className="sticky left-0 z-10 whitespace-nowrap bg-white font-medium text-slate-900">
                        {employee.name}
                      </Td>
                      {days.map((day) => {
                        const entry = entryFor(employee.id, day);
                        const absence = absenceFor(employee.id, day);
                        const isSelected = selected?.employeeId === employee.id && selected?.date === day;
                        return (
                          <Td key={day} className={`p-1 text-center ${isWeekend(day) ? "bg-slate-50" : ""}`}>
                            <button
                              onClick={() => selectCell(employee.id, employee.name, day)}
                              title={absence ? `Absence : ${absence.reason ?? "motif non précisé"}` : undefined}
                              className={`w-full rounded px-1.5 py-1 text-xs font-medium whitespace-nowrap ${
                                isSelected
                                  ? "bg-blue-100 text-blue-700"
                                  : absence
                                    ? "text-red-600 hover:bg-red-50"
                                    : entry
                                      ? "text-slate-700 hover:bg-slate-100"
                                      : "text-slate-300 hover:bg-slate-100"
                              }`}
                            >
                              {absence
                                ? (absence.reason || "Absent")
                                : entry
                                  ? `${formatTimeCompact(entry.startTime)}-${formatTimeCompact(entry.endTime)}`
                                  : "—"}
                            </button>
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

        {selected && (
          <div className="sticky top-6 w-72 shrink-0 self-start">
            <Card
              title={`${selected.employeeName} — ${selected.date}`}
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
              <div className="flex flex-col gap-4">
                {error && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
                )}
                {absenceFor(selected.employeeId, selected.date) && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    Absence déclarée ce jour-là
                    {absenceFor(selected.employeeId, selected.date)?.reason
                      ? ` : ${absenceFor(selected.employeeId, selected.date)?.reason}`
                      : "."}
                  </p>
                )}
                <label className={labelClass}>
                  Début
                  <input
                    type="time"
                    value={startTimeInput}
                    onChange={(e) => setStartTimeInput(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className={labelClass}>
                  Fin
                  <input
                    type="time"
                    value={endTimeInput}
                    onChange={(e) => setEndTimeInput(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    onClick={() =>
                      saveDay.mutate({
                        employeeId: selected.employeeId,
                        date: selected.date,
                        startTime: startTimeInput,
                        endTime: endTimeInput,
                      })
                    }
                    disabled={saveDay.isPending}
                  >
                    Enregistrer
                  </Button>
                  {entryFor(selected.employeeId, selected.date) && (
                    <Button
                      variant="danger"
                      onClick={() => clearDay.mutate({ employeeId: selected.employeeId, date: selected.date })}
                      disabled={clearDay.isPending}
                    >
                      Effacer
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
