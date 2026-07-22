import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { api, ApiError } from "../../api/client";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { inputClass } from "../../components/formStyles";
import { formatTimeCompact } from "../../lib/time";

export interface SchedulePreset {
  id: string;
  startTime: string;
  endTime: string;
}

const PRESETS_QUERY_KEY = ["schedule-presets"];

export function useSchedulePresets() {
  return useQuery({
    queryKey: PRESETS_QUERY_KEY,
    queryFn: () => api.get<SchedulePreset[]>("/schedule-presets"),
  });
}

export function SchedulePresetsPanel() {
  const queryClient = useQueryClient();
  const { data: presets, isLoading } = useSchedulePresets();
  const [newStart, setNewStart] = useState("08:00");
  const [newEnd, setNewEnd] = useState("16:00");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: PRESETS_QUERY_KEY });

  const create = useMutation({
    mutationFn: () => api.post<SchedulePreset>("/schedule-presets", { startTime: newStart, endTime: newEnd }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Erreur lors de la création"),
  });

  const update = useMutation({
    mutationFn: (vars: { id: string; startTime: string; endTime: string }) =>
      api.patch<SchedulePreset>(`/schedule-presets/${vars.id}`, {
        startTime: vars.startTime,
        endTime: vars.endTime,
      }),
    onSuccess: () => {
      setError(null);
      setEditingId(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Erreur lors de la modification"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/schedule-presets/${id}`),
    onSuccess: invalidate,
  });

  function startEdit(preset: SchedulePreset) {
    setEditingId(preset.id);
    setEditStart(preset.startTime);
    setEditEnd(preset.endTime);
    setError(null);
  }

  return (
    <Card title="Heures de base">
      <p className="mb-4 text-sm text-slate-500">
        Définissez des créneaux fréquents (ex. "6h-14h") pour les appliquer en un clic lors de la saisie des
        horaires ci-dessous.
      </p>

      {error && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {isLoading && <p className="text-sm text-slate-500">Chargement…</p>}

        {presets?.map((preset) =>
          editingId === preset.id ? (
            <div key={preset.id} className="flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 p-1.5">
              <input
                type="time"
                value={editStart}
                onChange={(e) => setEditStart(e.target.value)}
                className={`${inputClass} w-28 py-1`}
              />
              <span className="text-slate-400">–</span>
              <input
                type="time"
                value={editEnd}
                onChange={(e) => setEditEnd(e.target.value)}
                className={`${inputClass} w-28 py-1`}
              />
              <button
                onClick={() => update.mutate({ id: preset.id, startTime: editStart, endTime: editEnd })}
                disabled={update.isPending}
                className="rounded p-1 text-green-600 hover:bg-green-100"
                aria-label="Enregistrer"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                onClick={() => setEditingId(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-200"
                aria-label="Annuler"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div
              key={preset.id}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700"
            >
              {formatTimeCompact(preset.startTime)}-{formatTimeCompact(preset.endTime)}
              <button
                onClick={() => startEdit(preset)}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                aria-label={`Modifier ${preset.startTime}-${preset.endTime}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => remove.mutate(preset.id)}
                disabled={remove.isPending}
                className="rounded p-0.5 text-slate-400 hover:bg-red-100 hover:text-red-600"
                aria-label={`Supprimer ${preset.startTime}-${preset.endTime}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        )}

        <div className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 p-1.5">
          <input
            type="time"
            value={newStart}
            onChange={(e) => setNewStart(e.target.value)}
            className={`${inputClass} w-28 py-1`}
          />
          <span className="text-slate-400">–</span>
          <input
            type="time"
            value={newEnd}
            onChange={(e) => setNewEnd(e.target.value)}
            className={`${inputClass} w-28 py-1`}
          />
          <Button variant="secondary" onClick={() => create.mutate()} disabled={create.isPending}>
            <Plus className="h-4 w-4" />
            Ajouter
          </Button>
        </div>
      </div>
    </Card>
  );
}
