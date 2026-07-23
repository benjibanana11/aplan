import { useState, type FormEvent } from "react";
import type { AllowedSlot } from "@aplan/shared";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "../../components/Button";
import { inputClass, labelClass } from "../../components/formStyles";
import { splitMinutes } from "../../lib/duration";

export interface StaffingBandValues {
  startTime: string;
  endTime: string;
  minStaff: number;
  targetStaff: number;
  maxStaff: number;
}

export interface TaskFormValues {
  name: string;
  description: string;
  category: string;
  allowedSlot: AllowedSlot;
  customStartTime: string;
  customEndTime: string;
  maxContinuousMinutes: number;
  minContinuousMinutes: number;
  minStaff: number;
  targetStaff: number;
  maxStaff: number;
  maxTraineeSlots: number;
  requiresTraining: boolean;
  staffingBands: StaffingBandValues[];
}

const emptyBand: StaffingBandValues = {
  startTime: "08:00",
  endTime: "17:30",
  minStaff: 0,
  targetStaff: 1,
  maxStaff: 1,
};

const emptyValues: TaskFormValues = {
  name: "",
  description: "",
  category: "",
  allowedSlot: "ALL_DAY",
  customStartTime: "",
  customEndTime: "",
  maxContinuousMinutes: 120,
  minContinuousMinutes: 0,
  minStaff: 1,
  targetStaff: 1,
  maxStaff: 1,
  maxTraineeSlots: 0,
  requiresTraining: true,
  staffingBands: [],
};

export function TaskForm({
  initialValues,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initialValues?: TaskFormValues;
  onSubmit: (values: TaskFormValues) => Promise<void>;
  onCancel?: () => void;
  submitLabel: string;
}) {
  const [values, setValues] = useState<TaskFormValues>(initialValues ?? emptyValues);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { hours: maxDurationHours, minutes: maxDurationMinutes } = splitMinutes(values.maxContinuousMinutes);
  const { hours: minDurationHours, minutes: minDurationMinutes } = splitMinutes(values.minContinuousMinutes);

  function update<K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function updateMaxDuration(part: "hours" | "minutes", value: number) {
    const hours = part === "hours" ? value : maxDurationHours;
    const minutes = part === "minutes" ? value : maxDurationMinutes;
    update("maxContinuousMinutes", hours * 60 + minutes);
  }

  function updateMinDuration(part: "hours" | "minutes", value: number) {
    const hours = part === "hours" ? value : minDurationHours;
    const minutes = part === "minutes" ? value : minDurationMinutes;
    update("minContinuousMinutes", hours * 60 + minutes);
  }

  function updateBand(index: number, patch: Partial<StaffingBandValues>) {
    update(
      "staffingBands",
      values.staffingBands.map((band, i) => (i === index ? { ...band, ...patch } : band))
    );
  }

  function addBand() {
    update("staffingBands", [...values.staffingBands, { ...emptyBand }]);
  }

  function removeBand(index: number) {
    update(
      "staffingBands",
      values.staffingBands.filter((_, i) => i !== index)
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <label className={labelClass}>
        Nom
        <input value={values.name} onChange={(e) => update("name", e.target.value)} required className={inputClass} />
      </label>
      <label className={labelClass}>
        Description
        <textarea
          value={values.description}
          onChange={(e) => update("description", e.target.value)}
          required
          rows={3}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Catégorie
        <input
          value={values.category}
          onChange={(e) => update("category", e.target.value)}
          required
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Créneau autorisé
        <select
          value={values.allowedSlot}
          onChange={(e) => {
            const allowedSlot = e.target.value as AllowedSlot;
            update("allowedSlot", allowedSlot);
            if (allowedSlot === "CUSTOM") update("staffingBands", []);
          }}
          className={inputClass}
        >
          <option value="ALL_DAY">Toute la journée</option>
          <option value="MORNING">Matin uniquement</option>
          <option value="AFTERNOON">Après-midi uniquement</option>
          <option value="EVENING">Soir uniquement</option>
          <option value="CUSTOM">Personnalisé (heures strictes)</option>
        </select>
      </label>
      {values.allowedSlot === "CUSTOM" && (
        <div>
          <p className="mb-2 text-xs text-slate-500">
            La tâche doit impérativement débuter et se terminer exactement à ces heures — ce n'est pas une plage indicative.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              Début du créneau
              <input
                type="time"
                value={values.customStartTime}
                onChange={(e) => update("customStartTime", e.target.value)}
                required
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Fin du créneau
              <input
                type="time"
                value={values.customEndTime}
                onChange={(e) => update("customEndTime", e.target.value)}
                required
                className={inputClass}
              />
            </label>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">Durée max continue</span>
          <div className="grid grid-cols-2 gap-2">
            <label className={labelClass}>
              Heures
              <input
                type="number"
                min={0}
                value={maxDurationHours}
                onChange={(e) => updateMaxDuration("hours", Number(e.target.value))}
                required
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Minutes
              <input
                type="number"
                min={0}
                max={59}
                step={5}
                value={maxDurationMinutes}
                onChange={(e) => updateMaxDuration("minutes", Number(e.target.value))}
                required
                className={inputClass}
              />
            </label>
          </div>
        </div>
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">Durée minimale</span>
          <p className="mb-1 text-xs text-slate-500">0 = aucun minimum.</p>
          <div className="grid grid-cols-2 gap-2">
            <label className={labelClass}>
              Heures
              <input
                type="number"
                min={0}
                value={minDurationHours}
                onChange={(e) => updateMinDuration("hours", Number(e.target.value))}
                required
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Minutes
              <input
                type="number"
                min={0}
                max={59}
                step={5}
                value={minDurationMinutes}
                onChange={(e) => updateMinDuration("minutes", Number(e.target.value))}
                required
                className={inputClass}
              />
            </label>
          </div>
        </div>
      </div>
      <div>
        <span className="mb-1 block text-sm font-medium text-slate-700">Min / Cible / Max</span>
        {values.staffingBands.length > 0 && (
          <p className="mb-2 text-xs text-slate-500">
            Ignorés tant que des tranches horaires sont définies ci-dessous.
          </p>
        )}
        <div className="grid grid-cols-3 gap-3">
          <label className={labelClass}>
            Min
            <input
              type="number"
              min={0}
              value={values.minStaff}
              onChange={(e) => update("minStaff", Number(e.target.value))}
              required
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Cible
            <input
              type="number"
              min={0}
              value={values.targetStaff}
              onChange={(e) => update("targetStaff", Number(e.target.value))}
              required
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Max
            <input
              type="number"
              min={0}
              value={values.maxStaff}
              onChange={(e) => update("maxStaff", Number(e.target.value))}
              required
              className={inputClass}
            />
          </label>
        </div>
      </div>
      {values.allowedSlot !== "CUSTOM" && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Effectifs variables selon l'heure</span>
            <button
              type="button"
              onClick={addBand}
              className="flex items-center gap-1 rounded p-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter une tranche
            </button>
          </div>
          <p className="mb-2 text-xs text-slate-500">
            Ex. 4 personnes de 8h à 17h30, puis 1 seule après. Laisser vide pour utiliser Min/Cible/Max ci-dessus toute
            la journée.
          </p>
          {values.staffingBands.length > 0 && (
            <div className="flex flex-col gap-2">
              {values.staffingBands.map((band, index) => (
                <div key={index} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Tranche {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeBand(index)}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Supprimer la tranche"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className={labelClass}>
                      Début
                      <input
                        type="time"
                        value={band.startTime}
                        onChange={(e) => updateBand(index, { startTime: e.target.value })}
                        required
                        className={inputClass}
                      />
                    </label>
                    <label className={labelClass}>
                      Fin
                      <input
                        type="time"
                        value={band.endTime}
                        onChange={(e) => updateBand(index, { endTime: e.target.value })}
                        required
                        className={inputClass}
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <label className={labelClass}>
                      Min
                      <input
                        type="number"
                        min={0}
                        value={band.minStaff}
                        onChange={(e) => updateBand(index, { minStaff: Number(e.target.value) })}
                        required
                        className={inputClass}
                      />
                    </label>
                    <label className={labelClass}>
                      Cible
                      <input
                        type="number"
                        min={0}
                        value={band.targetStaff}
                        onChange={(e) => updateBand(index, { targetStaff: Number(e.target.value) })}
                        required
                        className={inputClass}
                      />
                    </label>
                    <label className={labelClass}>
                      Max
                      <input
                        type="number"
                        min={0}
                        value={band.maxStaff}
                        onChange={(e) => updateBand(index, { maxStaff: Number(e.target.value) })}
                        required
                        className={inputClass}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <label className={labelClass}>
        Doublons formation max
        <input
          type="number"
          min={0}
          value={values.maxTraineeSlots}
          onChange={(e) => update("maxTraineeSlots", Number(e.target.value))}
          required
          className={inputClass}
        />
      </label>
      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          checked={values.requiresTraining}
          onChange={(e) => update("requiresTraining", e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        Formation requise
      </label>
      <div className="flex gap-2 pt-2">
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Annuler
          </Button>
        )}
      </div>
    </form>
  );
}
