import { useState, type FormEvent } from "react";
import type { AllowedSlot } from "@aplan/shared";
import { Button } from "../../components/Button";
import { inputClass, labelClass } from "../../components/formStyles";
import { splitMinutes } from "../../lib/duration";

export interface TaskFormValues {
  name: string;
  description: string;
  category: string;
  allowedSlot: AllowedSlot;
  customStartTime: string;
  customEndTime: string;
  maxContinuousMinutes: number;
  minStaff: number;
  targetStaff: number;
  maxStaff: number;
  maxTraineeSlots: number;
  requiresTraining: boolean;
}

const emptyValues: TaskFormValues = {
  name: "",
  description: "",
  category: "",
  allowedSlot: "ALL_DAY",
  customStartTime: "",
  customEndTime: "",
  maxContinuousMinutes: 120,
  minStaff: 1,
  targetStaff: 1,
  maxStaff: 1,
  maxTraineeSlots: 0,
  requiresTraining: true,
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
  const { hours: durationHours, minutes: durationMinutes } = splitMinutes(values.maxContinuousMinutes);

  function update<K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function updateDuration(part: "hours" | "minutes", value: number) {
    const hours = part === "hours" ? value : durationHours;
    const minutes = part === "minutes" ? value : durationMinutes;
    update("maxContinuousMinutes", hours * 60 + minutes);
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
          onChange={(e) => update("allowedSlot", e.target.value as AllowedSlot)}
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
      <div>
        <span className="mb-1 block text-sm font-medium text-slate-700">Durée max continue</span>
        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            Heures
            <input
              type="number"
              min={0}
              value={durationHours}
              onChange={(e) => updateDuration("hours", Number(e.target.value))}
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
              value={durationMinutes}
              onChange={(e) => updateDuration("minutes", Number(e.target.value))}
              required
              className={inputClass}
            />
          </label>
        </div>
      </div>
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
