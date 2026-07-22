import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { PageHeader } from "../../components/PageHeader";
import { Card } from "../../components/Card";
import { inputClass } from "../../components/formStyles";
import { currentMonth, isWeekend, today, weeksInMonth } from "../../lib/dates";
import { formatTimeCompact } from "../../lib/time";

interface WorkScheduleEntry {
  date: string;
  startTime: string;
  endTime: string;
}

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function MyHoraireView() {
  const { user } = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const date = today();

  const { data: myEntries } = useQuery({
    queryKey: ["schedule", user?.id, month],
    queryFn: () => api.get<WorkScheduleEntry[]>(`/schedules/${user!.id}?month=${month}`),
    enabled: Boolean(user),
  });

  const weeks = useMemo(() => weeksInMonth(month), [month]);
  const entryByDate = useMemo(() => {
    const map = new Map<string, WorkScheduleEntry>();
    for (const entry of myEntries ?? []) {
      map.set(entry.date.slice(0, 10), entry);
    }
    return map;
  }, [myEntries]);

  return (
    <div>
      <PageHeader
        title="Horaire"
        actions={
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Mois
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputClass} />
          </label>
        }
      />

      <Card title="Mes horaires du mois">
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="text-center text-xs font-semibold text-slate-400 uppercase">
              {label}
            </div>
          ))}
          {weeks.map((week, weekIndex) =>
            week.map((day, dayIndex) => {
              if (!day) return <div key={`${weekIndex}-${dayIndex}`} />;
              const entry = entryByDate.get(day);
              const isToday = day === date;
              return (
                <div
                  key={day}
                  className={`flex min-h-[4.5rem] flex-col rounded-lg border p-2 ${
                    isWeekend(day) ? "bg-slate-50" : "bg-white"
                  } ${isToday ? "border-blue-400 ring-1 ring-blue-400" : "border-slate-200"}`}
                >
                  <span className="text-xs font-medium text-slate-500">{Number(day.slice(-2))}</span>
                  {entry ? (
                    <span className="mt-1 self-start rounded bg-blue-50 px-1.5 py-1 text-xs font-medium text-blue-700">
                      {formatTimeCompact(entry.startTime)}-{formatTimeCompact(entry.endTime)}
                    </span>
                  ) : (
                    <span className="mt-1 text-xs text-slate-300">—</span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}
