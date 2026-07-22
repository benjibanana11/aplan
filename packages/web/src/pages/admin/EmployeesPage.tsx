import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CalendarClock, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { api, ApiError } from "../../api/client";
import { PageHeader } from "../../components/PageHeader";
import { Card } from "../../components/Card";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { StatCard } from "../../components/StatCard";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../components/Table";
import { EmployeeForm, type EmployeeFormValues } from "./EmployeeForm";

interface Employee {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  hireDate: string;
}

export function EmployeesPage() {
  const queryClient = useQueryClient();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const { data: employees, isLoading } = useQuery({
    queryKey: ["employees"],
    queryFn: () => api.get<Employee[]>("/employees"),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.patch<Employee>(`/employees/${id}`, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["employees"] }),
  });

  const deleteEmployee = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/employees/${id}`),
    onSuccess: () => {
      setDeleteError(null);
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (error) => {
      setDeleteError(error instanceof ApiError ? error.message : "Erreur lors de la suppression");
    },
  });

  const createEmployee = useMutation({
    mutationFn: (values: EmployeeFormValues) => api.post<Employee>("/employees", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setCreating(false);
    },
  });

  const updateEmployee = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Omit<EmployeeFormValues, "password"> }) =>
      api.patch<Employee>(`/employees/${id}`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setEditing(null);
    },
  });

  const activeCount = employees?.filter((e) => e.active).length ?? 0;

  return (
    <div>
      <PageHeader
        title="Employés"
        subtitle="Gérez les comptes et les horaires de votre équipe"
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setEditing(null);
              setCreating(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Ajouter un employé
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard icon={Users} value={employees?.length ?? 0} label="Employés au total" tone="blue" />
        <StatCard icon={Users} value={activeCount} label="Comptes actifs" tone="green" />
      </div>

      {deleteError && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {deleteError}
        </p>
      )}

      <div className="flex items-start gap-6">
        <div className="min-w-0 flex-1">
          <Card>
            {isLoading && <p className="text-sm text-slate-500">Chargement…</p>}
            {!isLoading && (
              <Table>
                <Thead>
                  <Tr>
                    <Th>Nom</Th>
                    <Th>Email</Th>
                    <Th>Rôle</Th>
                    <Th>Statut</Th>
                    <Th>Horaire mensuel</Th>
                    <Th></Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {employees?.map((employee) => (
                    <Tr key={employee.id} className="hover:bg-slate-50">
                      <Td className="font-medium text-slate-900">{employee.name}</Td>
                      <Td>{employee.email}</Td>
                      <Td>
                        <Badge tone={employee.role === "ADMIN" ? "purple" : "slate"}>{employee.role}</Badge>
                      </Td>
                      <Td>
                        <Badge tone={employee.active ? "green" : "red"}>{employee.active ? "Actif" : "Inactif"}</Badge>
                      </Td>
                      <Td>
                        <Link
                          to={`/admin/employees/${employee.id}/schedule`}
                          className="inline-flex items-center gap-1.5 font-medium text-blue-600 hover:underline"
                        >
                          <CalendarClock className="h-4 w-4" />
                          Gérer l'horaire
                        </Link>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setCreating(false);
                              setEditing(employee);
                            }}
                            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                            aria-label={`Modifier ${employee.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <Button
                            variant={employee.active ? "danger" : "secondary"}
                            onClick={() => toggleActive.mutate({ id: employee.id, active: !employee.active })}
                          >
                            {employee.active ? "Désactiver" : "Réactiver"}
                          </Button>
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                confirm(
                                  `Supprimer définitivement ${employee.name} ? Son horaire, ses compétences et ses affectations passées seront aussi supprimés.`
                                )
                              ) {
                                deleteEmployee.mutate(employee.id);
                              }
                            }}
                            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            aria-label={`Supprimer ${employee.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </Card>
        </div>

        {creating && (
          <div className="sticky top-6 w-96 shrink-0 self-start">
            <Card
              title="Nouvel employé"
              actions={
                <button
                  onClick={() => setCreating(false)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Fermer"
                >
                  <X className="h-4 w-4" />
                </button>
              }
            >
              <EmployeeForm
                onCancel={() => setCreating(false)}
                onSubmit={async (values) => {
                  await createEmployee.mutateAsync(values);
                }}
              />
            </Card>
          </div>
        )}

        {editing && (
          <div className="sticky top-6 w-96 shrink-0 self-start">
            <Card
              title={`Modifier ${editing.name}`}
              actions={
                <button
                  onClick={() => setEditing(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Fermer"
                >
                  <X className="h-4 w-4" />
                </button>
              }
            >
              <EmployeeForm
                initialValues={{
                  name: editing.name,
                  email: editing.email,
                  hireDate: editing.hireDate.slice(0, 10),
                }}
                submitLabel="Enregistrer"
                onCancel={() => setEditing(null)}
                onSubmit={async (values) => {
                  await updateEmployee.mutateAsync({
                    id: editing.id,
                    values: { name: values.name, email: values.email, hireDate: values.hireDate },
                  });
                }}
              />
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
