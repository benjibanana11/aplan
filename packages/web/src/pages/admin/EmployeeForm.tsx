import { useState, type FormEvent } from "react";
import { Button } from "../../components/Button";
import { inputClass, labelClass } from "../../components/formStyles";

export interface EmployeeFormValues {
  name: string;
  email: string;
  password: string;
  hireDate: string;
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function EmployeeForm({
  initialValues,
  onSubmit,
  onCancel,
  submitLabel = "Créer",
}: {
  initialValues?: Omit<EmployeeFormValues, "password">;
  onSubmit: (values: EmployeeFormValues) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}) {
  const isEditing = Boolean(initialValues);
  const [values, setValues] = useState<EmployeeFormValues>(
    initialValues ? { ...initialValues, password: "" } : { name: "", email: "", password: "", hireDate: today() }
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof EmployeeFormValues>(key: K, value: EmployeeFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
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
        Email
        <input
          type="email"
          value={values.email}
          onChange={(e) => update("email", e.target.value)}
          required
          className={inputClass}
        />
      </label>
      {!isEditing && (
        <label className={labelClass}>
          Mot de passe initial
          <input
            type="password"
            value={values.password}
            onChange={(e) => update("password", e.target.value)}
            minLength={8}
            required
            className={inputClass}
          />
        </label>
      )}
      <label className={labelClass}>
        Date d'entrée
        <input
          type="date"
          value={values.hireDate}
          onChange={(e) => update("hireDate", e.target.value)}
          required
          className={inputClass}
        />
      </label>
      <div className="flex gap-2 pt-2">
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitLabel}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
