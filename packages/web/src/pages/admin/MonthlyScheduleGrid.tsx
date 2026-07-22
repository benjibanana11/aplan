import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { PageHeader } from "../../components/PageHeader";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../components/Table";
import { inputClass } from "../../components/formStyles";
import { formatTimeCompact } from "../../lib/time";
import { presetColorFor, useSchedulePresets } from "./SchedulePresetsPanel";

interface WorkScheduleEntry {
  date: string;
  startTime: string;
  endTime: string;
}

function daysInMonth(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  const count = new Date(year, monthIndex, 0).getDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function MonthlyScheduleGrid() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState<Record<string, { startTime: string; endTime: string }>>({});

  const { data: entries } = useQuery({
    queryKey: ["schedule", employeeId, month],
    queryFn: () => api.get<WorkScheduleEntry[]>(`/schedules/${employeeId}?month=${month}`),
    enabled: Boolean(employeeId),
  });
  const { data: presets } = useSchedulePresets();

  useEffect(() => {
    const next: Record<string, { startTime: string; endTime: string }> = {};
    for (const entry of entries ?? []) {
      next[entry.date.slice(0, 10)] = { startTime: entry.startTime, endTime: entry.endTime };
    }
    setRows(next);
  }, [entries]);

  const days = useMemo(() => daysInMonth(month), [month]);

  const save = useMutation({
    mutationFn: () =>
      api.put(`/schedules/${employeeId}?month=${month}`, {
        entries: Object.entries(rows)
          .filter(([, v]) => v.startTime && v.endTime)
          .map(([date, v]) => ({ date, startTime: v.startTime, endTime: v.endTime })),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["schedule", employeeId, month] }),
  });

  function updateRow(date: string, field: "startTime" | "endTime", value: string) {
    setRows((prev) => ({ ...prev, [date]: { ...prev[date], [field]: value } as { startTime: string; endTime: string } }));
  }

  function applyPreset(date: string, startTime: string, endTime: string) {
    setRows((prev) => ({ ...prev, [date]: { startTime, endTime } }));
  }

  return (
    <div>
      <PageHeader
        title="Horaire mensuel"
        backTo="/admin/employees"
        actions={
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Mois
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputClass} />
          </label>
        }
      />

      <Card>
        <div className="max-h-[32rem] overflow-y-auto">
          <Table>
            <Thead>
              <Tr>
                <Th>Date</Th>
                <Th>Début</Th>
                <Th>Fin</Th>
                {presets && presets.length > 0 && <Th>Heures de base</Th>}
              </Tr>
            </Thead>
            <Tbody>
              {days.map((date) => (
                <Tr key={date}>
                  <Td>{date}</Td>
                  <Td>
                    <input
                      type="time"
                      value={rows[date]?.startTime ?? ""}
                      onChange={(e) => updateRow(date, "startTime", e.target.value)}
                      className={inputClass}
                    />
                  </Td>
                  <Td>
                    <input
                      type="time"
                      value={rows[date]?.endTime ?? ""}
                      onChange={(e) => updateRow(date, "endTime", e.target.value)}
                      className={inputClass}
                    />
                  </Td>
                  {presets && presets.length > 0 && (
                    <Td>
                      <div className="flex flex-wrap gap-1.5">
                        {presets.map((preset) => {
                          const color = presetColorFor(presets, preset.startTime, preset.endTime)!;
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => applyPreset(date, preset.startTime, preset.endTime)}
                              className={`rounded-lg border px-2 py-1 text-xs font-medium hover:opacity-80 ${color.bg} ${color.text} ${color.border}`}
                            >
                              {formatTimeCompact(preset.startTime)}-{formatTimeCompact(preset.endTime)}
                            </button>
                          );
                        })}
                      </div>
                    </Td>
                  )}
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
            Enregistrer
          </Button>
          {save.isSuccess && <span className="text-sm text-green-700">Horaire enregistré.</span>}
        </div>
      </Card>
    </div>
  );
}
