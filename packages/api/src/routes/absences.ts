import { Router } from "express";
import { createAbsenceSchema, resolveAbsenceSchema } from "@aplan/shared";
import { prisma } from "../db.js";
import { requireAdmin, requireAuth } from "../middleware/requireAuth.js";
import { parseDateOnly } from "../planning/time.js";
import { suggestReplacements } from "../planning/suggestReplacement.js";
import { recalculateDayIfPlanned } from "../planning/recalculateDay.js";

export const absencesRouter = Router();

absencesRouter.post("/", requireAuth, async (req, res) => {
  const parsed = createAbsenceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const organizationId = req.session.organizationId!;
  const { employeeId, date, reason } = parsed.data;

  if (req.session.role !== "ADMIN" && req.session.userId !== employeeId) {
    res.status(403).json({ error: "Vous ne pouvez déclarer une absence que pour vous-même" });
    return;
  }

  const employee = await prisma.user.findFirst({ where: { id: employeeId, organizationId } });
  if (!employee) {
    res.status(404).json({ error: "Employé introuvable" });
    return;
  }

  const absence = await prisma.absence.create({
    data: { employeeId, date: parseDateOnly(date), reason },
  });

  // Si un planning existait déjà pour ce jour (généré ou validé), le recalculer immédiatement en
  // excluant l'employé absent — le planning repasse alors "à valider" (voir needsRevalidation).
  const recalculated = await recalculateDayIfPlanned(organizationId, date);

  const suggestions = recalculated ? [] : await suggestReplacements(organizationId, employeeId, date);
  if (suggestions.length > 0) {
    await prisma.absence.update({
      where: { id: absence.id },
      data: { suggestedReplacementUserId: suggestions[0].suggestedReplacementUserId },
    });
  }

  res
    .status(201)
    .json({ id: absence.id, employeeId, date, reason: reason ?? null, status: "PENDING", suggestions, recalculated });
});

absencesRouter.get("/", requireAdmin, async (req, res) => {
  const organizationId = req.session.organizationId!;
  const date = typeof req.query.date === "string" ? req.query.date : undefined;

  const absences = await prisma.absence.findMany({
    where: {
      employee: { organizationId },
      ...(date ? { date: parseDateOnly(date) } : {}),
    },
    include: { employee: { select: { name: true } }, suggestedReplacement: { select: { name: true } } },
    orderBy: { date: "desc" },
  });

  res.json(
    absences.map((a) => ({
      id: a.id,
      employeeId: a.employeeId,
      employeeName: a.employee.name,
      date: a.date.toISOString().slice(0, 10),
      reason: a.reason,
      status: a.status,
      suggestedReplacementUserId: a.suggestedReplacementUserId,
      suggestedReplacementName: a.suggestedReplacement?.name ?? null,
    }))
  );
});

absencesRouter.get("/:id/suggestions", requireAdmin, async (req, res) => {
  const organizationId = req.session.organizationId!;
  const absence = await prisma.absence.findFirst({
    where: { id: req.params.id, employee: { organizationId } },
  });
  if (!absence) {
    res.status(404).json({ error: "Absence introuvable" });
    return;
  }

  const date = absence.date.toISOString().slice(0, 10);
  const suggestions = await suggestReplacements(organizationId, absence.employeeId, date);
  res.json(suggestions);
});

absencesRouter.post("/:id/resolve", requireAdmin, async (req, res) => {
  const parsed = resolveAbsenceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const organizationId = req.session.organizationId!;
  const absence = await prisma.absence.findFirst({
    where: { id: req.params.id, employee: { organizationId } },
    include: { employee: { select: { name: true } } },
  });
  if (!absence) {
    res.status(404).json({ error: "Absence introuvable" });
    return;
  }

  const replacementIds = parsed.data.decisions.map((d) => d.replacementUserId).filter((id): id is string => id !== null);
  if (replacementIds.length > 0) {
    const validReplacements = await prisma.user.findMany({
      where: { id: { in: replacementIds }, organizationId },
      select: { id: true, name: true },
    });
    if (validReplacements.length !== new Set(replacementIds).size) {
      res.status(400).json({ error: "Remplaçant invalide pour cette organisation" });
      return;
    }
    const namesById = new Map(validReplacements.map((u) => [u.id, u.name]));

    await prisma.$transaction(
      parsed.data.decisions
        .filter((d) => d.replacementUserId !== null)
        .map((d) =>
          prisma.planningBlock.updateMany({
            where: {
              employeeId: absence.employeeId,
              taskId: d.taskId,
              date: absence.date,
              startTime: d.startTime,
              endTime: d.endTime,
            },
            data: {
              employeeId: d.replacementUserId!,
              source: "MANUAL",
              justification: `Remplacement de ${absence.employee.name} (absence validée) par ${namesById.get(d.replacementUserId!)}.`,
            },
          })
        )
    );
  }

  const firstApplied = parsed.data.decisions.find((d) => d.replacementUserId !== null)?.replacementUserId ?? null;
  const updated = await prisma.absence.update({
    where: { id: absence.id },
    data: { status: "VALIDATED", validatedByUserId: req.session.userId, suggestedReplacementUserId: firstApplied },
  });

  res.json({ id: updated.id, status: updated.status });
});

absencesRouter.post("/:id/reject", requireAdmin, async (req, res) => {
  const organizationId = req.session.organizationId!;
  const absence = await prisma.absence.findFirst({ where: { id: req.params.id, employee: { organizationId } } });
  if (!absence) {
    res.status(404).json({ error: "Absence introuvable" });
    return;
  }

  const updated = await prisma.absence.update({
    where: { id: absence.id },
    data: { status: "REJECTED", validatedByUserId: req.session.userId },
  });
  res.json({ id: updated.id, status: updated.status });
});
