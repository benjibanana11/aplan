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
  const teamId = req.session.teamId!;
  const { employeeId, date, reason } = parsed.data;

  if (req.session.role !== "ADMIN" && req.session.userId !== employeeId) {
    res.status(403).json({ error: "Vous ne pouvez déclarer une absence que pour vous-même" });
    return;
  }

  const membership = await prisma.teamMembership.findFirst({ where: { userId: employeeId, teamId } });
  if (!membership) {
    res.status(404).json({ error: "Employé introuvable" });
    return;
  }

  const absence = await prisma.absence.create({
    data: { employeeId, teamId, date: parseDateOnly(date), reason },
  });

  // Si un planning existait déjà pour ce jour (généré ou validé), le recalculer immédiatement en
  // excluant l'employé absent — le planning repasse alors "à valider" (voir needsRevalidation).
  const recalculated = await recalculateDayIfPlanned(teamId, date);

  const suggestions = recalculated ? [] : await suggestReplacements(teamId, employeeId, date);
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
  const teamId = req.session.teamId;
  const date = typeof req.query.date === "string" ? req.query.date : undefined;

  const absences = await prisma.absence.findMany({
    where: {
      teamId,
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
  const teamId = req.session.teamId!;
  const absence = await prisma.absence.findFirst({
    where: { id: req.params.id, teamId },
  });
  if (!absence) {
    res.status(404).json({ error: "Absence introuvable" });
    return;
  }

  const date = absence.date.toISOString().slice(0, 10);
  const suggestions = await suggestReplacements(teamId, absence.employeeId, date);
  res.json(suggestions);
});

absencesRouter.post("/:id/resolve", requireAdmin, async (req, res) => {
  const parsed = resolveAbsenceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const teamId = req.session.teamId!;
  const absence = await prisma.absence.findFirst({
    where: { id: req.params.id, teamId },
    include: { employee: { select: { name: true } } },
  });
  if (!absence) {
    res.status(404).json({ error: "Absence introuvable" });
    return;
  }

  const replacementIds = parsed.data.decisions.map((d) => d.replacementUserId).filter((id): id is string => id !== null);
  if (replacementIds.length > 0) {
    const validReplacements = await prisma.teamMembership.findMany({
      where: { userId: { in: replacementIds }, teamId },
      include: { user: { select: { id: true, name: true } } },
    });
    if (validReplacements.length !== new Set(replacementIds).size) {
      res.status(400).json({ error: "Remplaçant invalide pour cette équipe" });
      return;
    }
    const namesById = new Map(validReplacements.map((m) => [m.user.id, m.user.name]));

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
  const teamId = req.session.teamId;
  const absence = await prisma.absence.findFirst({ where: { id: req.params.id, teamId } });
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
