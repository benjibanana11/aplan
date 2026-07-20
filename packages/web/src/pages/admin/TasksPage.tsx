import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2, X } from "lucide-react";
import type { AllowedSlot } from "@aplan/shared";
import { api } from "../../api/client";
import { PageHeader } from "../../components/PageHeader";
import { Button } from "../../components/Button";
import { Badge } from "../../components/Badge";
import { Card } from "../../components/Card";
import { Table, Thead, Tbody, Tr, Th, Td } from "../../components/Table";
import { formatMinutesAsHours } from "../../lib/duration";
import { useScrollIntoView } from "../../lib/useScrollIntoView";
import { TaskForm, type TaskFormValues } from "./TaskForm";

interface Task extends TaskFormValues {
  id: string;
  priorityRank: number;
}

const slotLabels: Record<AllowedSlot, string> = {
  ALL_DAY: "Toute la journée",
  MORNING: "Matin uniquement",
  AFTERNOON: "Après-midi uniquement",
  EVENING: "Soir uniquement",
  CUSTOM: "Personnalisé",
};

const slotTones: Record<AllowedSlot, "blue" | "amber" | "green" | "slate" | "purple"> = {
  ALL_DAY: "blue",
  MORNING: "amber",
  AFTERNOON: "green",
  EVENING: "slate",
  CUSTOM: "purple",
};

function toPayload(values: TaskFormValues) {
  return {
    ...values,
    customStartTime: values.customStartTime || undefined,
    customEndTime: values.customEndTime || undefined,
  };
}

function SortableTaskRow({
  task,
  selected,
  onSelect,
  onDelete,
}: {
  task: Task;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Tr ref={setNodeRef} style={style} className={selected ? "bg-blue-50" : "cursor-pointer hover:bg-slate-50"}>
      <Td className="w-8">
        <span {...attributes} {...listeners} className="cursor-grab text-slate-400 hover:text-slate-600">
          <GripVertical className="h-4 w-4" />
        </span>
      </Td>
      <Td onClick={onSelect} className="font-medium text-slate-900">
        {task.name}
      </Td>
      <Td onClick={onSelect}>{task.category}</Td>
      <Td onClick={onSelect}>
        <Badge tone={slotTones[task.allowedSlot]}>{slotLabels[task.allowedSlot]}</Badge>
      </Td>
      <Td onClick={onSelect}>
        {task.minStaff} / {task.targetStaff} / {task.maxStaff}
      </Td>
      <Td onClick={onSelect}>{formatMinutesAsHours(task.maxContinuousMinutes)}</Td>
      <Td>
        <button
          type="button"
          onClick={onDelete}
          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
          aria-label="Supprimer"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </Td>
    </Tr>
  );
}

export function TasksPage() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => api.get<Task[]>("/tasks"),
  });

  const createTask = useMutation({
    mutationFn: (values: TaskFormValues) => api.post<Task>("/tasks", toPayload(values)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setCreating(false);
    },
  });

  const updateTask = useMutation({
    mutationFn: ({ id, values }: { id: string; values: TaskFormValues }) =>
      api.put<Task>(`/tasks/${id}`, toPayload(values)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const deleteTask = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/tasks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setEditingId(null);
    },
  });

  const reorderTasks = useMutation({
    mutationFn: (orderedIds: string[]) => api.patch<Task[]>("/tasks/reorder", { orderedIds }),
    onSuccess: (updated) => queryClient.setQueryData(["tasks"], updated),
  });

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!tasks || !over || active.id === over.id) return;
    const oldIndex = tasks.findIndex((t) => t.id === active.id);
    const newIndex = tasks.findIndex((t) => t.id === over.id);
    const reordered = arrayMove(tasks, oldIndex, newIndex);
    queryClient.setQueryData(["tasks"], reordered);
    reorderTasks.mutate(reordered.map((t) => t.id));
  }

  const editingTask = tasks?.find((t) => t.id === editingId);
  const panelOpen = Boolean(editingTask) || creating;
  const panelRef = useScrollIntoView<HTMLDivElement>(panelOpen);

  return (
    <div>
      <PageHeader
        title="Gestion des types de tâches"
        subtitle="Configurez les types de tâches disponibles et leurs paramètres"
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setEditingId(null);
              setCreating(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Ajouter une tâche
          </Button>
        }
      />

      <div className="flex items-start gap-6">
        <div className="min-w-0 flex-1">
          <Card>
            {isLoading && <p className="text-sm text-slate-500">Chargement…</p>}
            {!isLoading && (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <Table>
                  <Thead>
                    <Tr>
                      <Th></Th>
                      <Th>Tâche</Th>
                      <Th>Catégorie</Th>
                      <Th>Créneau</Th>
                      <Th>Min / Cible / Max</Th>
                      <Th>Durée max continue</Th>
                      <Th></Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    <SortableContext items={tasks?.map((t) => t.id) ?? []} strategy={verticalListSortingStrategy}>
                      {tasks?.map((task) => (
                        <SortableTaskRow
                          key={task.id}
                          task={task}
                          selected={task.id === editingId}
                          onSelect={() => {
                            setCreating(false);
                            setEditingId(task.id);
                          }}
                          onDelete={() => {
                            if (confirm(`Supprimer la tâche "${task.name}" ?`)) deleteTask.mutate(task.id);
                          }}
                        />
                      ))}
                    </SortableContext>
                  </Tbody>
                </Table>
              </DndContext>
            )}
          </Card>
        </div>

        {panelOpen && (
          <div ref={panelRef} className="w-96 shrink-0 scroll-mt-6">
            <Card
              title={editingTask ? "Modifier la tâche" : "Nouvelle tâche"}
              actions={
                <button
                  onClick={() => {
                    setEditingId(null);
                    setCreating(false);
                  }}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Fermer"
                >
                  <X className="h-4 w-4" />
                </button>
              }
            >
              {editingTask && (
                <TaskForm
                  key={editingTask.id}
                  initialValues={editingTask}
                  submitLabel="Enregistrer"
                  onCancel={() => setEditingId(null)}
                  onSubmit={async (values) => {
                    await updateTask.mutateAsync({ id: editingTask.id, values });
                  }}
                />
              )}
              {creating && (
                <TaskForm
                  submitLabel="Créer"
                  onCancel={() => setCreating(false)}
                  onSubmit={async (values) => {
                    await createTask.mutateAsync(values);
                  }}
                />
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
