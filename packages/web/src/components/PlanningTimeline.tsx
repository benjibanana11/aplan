import { GraduationCap } from "lucide-react";
import { initials } from "../lib/initials";
import { timeToMinutes } from "../lib/time";

interface PlanningBlock {
  id?: string;
  employeeId: string;
  employeeName: string;
  taskId: string;
  taskName: string;
  startTime: string;
  endTime: string;
  isTraining?: boolean;
  trainerName?: string | null;
}

const PALETTE = [
  { bg: "bg-blue-100", text: "text-blue-700", dot: "bg-blue-500" },
  { bg: "bg-purple-100", text: "text-purple-700", dot: "bg-purple-500" },
  { bg: "bg-green-100", text: "text-green-700", dot: "bg-green-500" },
  { bg: "bg-amber-100", text: "text-amber-700", dot: "bg-amber-500" },
  { bg: "bg-pink-100", text: "text-pink-700", dot: "bg-pink-500" },
  { bg: "bg-teal-100", text: "text-teal-700", dot: "bg-teal-500" },
  { bg: "bg-indigo-100", text: "text-indigo-700", dot: "bg-indigo-500" },
  { bg: "bg-orange-100", text: "text-orange-700", dot: "bg-orange-500" },
];

export function PlanningTimeline({ blocks, taskOrder }: { blocks: PlanningBlock[]; taskOrder: string[] }) {
  if (blocks.length === 0) {
    return <p className="text-sm text-slate-500">Aucun bloc à afficher pour cette date.</p>;
  }

  const colorForTask = (taskId: string) => {
    const index = taskOrder.indexOf(taskId);
    return PALETTE[(index === -1 ? 0 : index) % PALETTE.length];
  };

  const starts = blocks.map((b) => timeToMinutes(b.startTime));
  const ends = blocks.map((b) => timeToMinutes(b.endTime));
  const axisStartHour = Math.max(0, Math.floor(Math.min(...starts) / 60));
  const axisEndHour = Math.min(24, Math.ceil(Math.max(...ends) / 60));
  const axisStart = axisStartHour * 60;
  const axisEnd = axisEndHour * 60;
  const hours = Array.from({ length: axisEndHour - axisStartHour + 1 }, (_, i) => axisStartHour + i);
  const pct = (minutes: number) => ((minutes - axisStart) / (axisEnd - axisStart)) * 100;

  const blocksByEmployee = new Map<string, { name: string; blocks: PlanningBlock[] }>();
  for (const block of blocks) {
    const entry = blocksByEmployee.get(block.employeeId) ?? { name: block.employeeName, blocks: [] };
    entry.blocks.push(block);
    blocksByEmployee.set(block.employeeId, entry);
  }
  const rows = Array.from(blocksByEmployee.values()).sort((a, b) => a.name.localeCompare(b.name));

  const legendTasks = Array.from(new Map(blocks.map((b) => [b.taskId, b.taskName])).entries());

  return (
    <div>
      <div className="grid" style={{ gridTemplateColumns: "12rem 1fr" }}>
        <div />
        <div className="relative h-6">
          {hours.map((h) => (
            <span
              key={h}
              className="absolute -translate-x-1/2 text-xs text-slate-400"
              style={{ left: `${pct(h * 60)}%` }}
            >
              {String(h).padStart(2, "0")}:00
            </span>
          ))}
        </div>

        {rows.map((row) => (
          <div key={row.name} className="contents">
            <div className="flex items-center gap-2 border-t border-slate-100 py-3 pr-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                {initials(row.name)}
              </div>
              <span className="truncate text-sm font-medium text-slate-900">{row.name}</span>
            </div>
            <div className="relative border-t border-slate-100 py-3">
              <div className="relative h-8">
                {hours.map((h) => (
                  <div
                    key={h}
                    className="absolute top-0 bottom-0 border-l border-slate-100"
                    style={{ left: `${pct(h * 60)}%` }}
                  />
                ))}
                {row.blocks.map((block, i) => {
                  const color = colorForTask(block.taskId);
                  const left = pct(timeToMinutes(block.startTime));
                  const width = pct(timeToMinutes(block.endTime)) - left;
                  const trainingSuffix = block.isTraining
                    ? ` — en formation${block.trainerName ? `, encadré(e) par ${block.trainerName}` : ""}`
                    : "";
                  return (
                    <div
                      key={block.id ?? i}
                      title={`${block.taskName} (${block.startTime}–${block.endTime})${trainingSuffix}`}
                      className={`absolute top-0 flex h-8 items-center gap-1 overflow-hidden rounded-md px-2 text-xs font-medium whitespace-nowrap ${color.bg} ${color.text} ${
                        block.isTraining ? "ring-2 ring-inset ring-amber-400" : ""
                      }`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    >
                      {block.isTraining && <GraduationCap className="h-3.5 w-3.5 shrink-0" />}
                      <span className="truncate">{block.taskName}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-100 pt-4">
        {legendTasks.map(([taskId, taskName]) => (
          <div key={taskId} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className={`h-2.5 w-2.5 rounded-full ${colorForTask(taskId).dot}`} />
            {taskName}
          </div>
        ))}
      </div>
    </div>
  );
}
