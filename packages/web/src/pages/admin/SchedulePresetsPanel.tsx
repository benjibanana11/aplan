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

// Une couleur par heure de base, assignée par ordre d'affichage (donc stable pour un jeu de
// préréglages donné) et réutilisée partout où ce préréglage apparaît : chips de gestion,
// suggestions rapides, et cases du tableau qui correspondent exactement à ces horaires.
const PRESET_PALETTE = [
  { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", dot: "bg-blue-500" },
  { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", dot: "bg-purple-500" },
  { bg: "bg-green-50", text: "text-green-700", border: "border-green-200", dot: "bg-green-500" },
  { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" },
  { bg: "bg-pink-50", text: "text-pink-700", border: "border-pink-200", dot: "bg-pink-500" },
  { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200", dot: "bg-teal-500" },
  { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200", dot: "bg-indigo-500" },
  { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", dot: "bg-orange-500" },
];

export function useSchedulePresets() {
  return useQuery({
    queryKey: PRESETS_QUERY_KEY,
    queryFn: () => api.get<SchedulePreset[]>("/schedule-presets"),
  });
}

/** Couleur assignée à un préréglage donné (par sa position dans la liste), ou à l'horaire d'une
 * case du tableau qui correspond exactement au début/fin d'un préréglage. */
export function presetColorFor(presets: SchedulePreset[] | undefined, startTime: string, endTime: string) {
  if (!presets) return undefined;
  const index = presets.findIndex((p) => p.startTime === startTime && p.endTime === endTime);
  return index === -1 ? undefined : PRESET_PALETTE[index % PRESET_PALETTE.length];
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
            (() => {
              const color = presetColorFor(presets, preset.startTime, preset.endTime)!;
              return (
                <div
                  key={preset.id}
                  className={`flex items-center gap-1.5 rounded-lg border ${color.border} ${color.bg} px-3 py-1.5 text-sm font-medium ${color.text}`}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${color.dot}`} />
                  {formatTimeCompact(preset.startTime)}-{formatTimeCompact(preset.endTime)}
                  <button
                    onClick={() => startEdit(preset)}
                    className="rounded p-0.5 opacity-60 hover:bg-white/60 hover:opacity-100"
                    aria-label={`Modifier ${preset.startTime}-${preset.endTime}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => remove.mutate(preset.id)}
                    disabled={remove.isPending}
                    className="rounded p-0.5 opacity-60 hover:bg-white/60 hover:text-red-600 hover:opacity-100"
                    aria-label={`Supprimer ${preset.startTime}-${preset.endTime}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })()
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
