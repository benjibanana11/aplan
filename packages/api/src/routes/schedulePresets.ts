import { Router } from "express";
import { schedulePresetSchema } from "@aplan/shared";
import { prisma } from "../db.js";
import { requireAdmin } from "../middleware/requireAuth.js";

export const schedulePresetsRouter = Router();

schedulePresetsRouter.get("/", requireAdmin, async (req, res) => {
  const presets = await prisma.schedulePreset.findMany({
    where: { organizationId: req.session.organizationId },
    orderBy: { startTime: "asc" },
  });
  res.json(presets);
});

schedulePresetsRouter.post("/", requireAdmin, async (req, res) => {
  const parsed = schedulePresetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const organizationId = req.session.organizationId!;
  const { startTime, endTime } = parsed.data;

  const existing = await prisma.schedulePreset.findUnique({
    where: { organizationId_startTime_endTime: { organizationId, startTime, endTime } },
  });
  if (existing) {
    res.status(409).json({ error: "Cette heure de base existe déjà" });
    return;
  }

  const preset = await prisma.schedulePreset.create({ data: { organizationId, startTime, endTime } });
  res.status(201).json(preset);
});

schedulePresetsRouter.patch("/:id", requireAdmin, async (req, res) => {
  const parsed = schedulePresetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const organizationId = req.session.organizationId!;

  const preset = await prisma.schedulePreset.findFirst({ where: { id: req.params.id, organizationId } });
  if (!preset) {
    res.status(404).json({ error: "Heure de base introuvable" });
    return;
  }

  const { startTime, endTime } = parsed.data;
  const duplicate = await prisma.schedulePreset.findUnique({
    where: { organizationId_startTime_endTime: { organizationId, startTime, endTime } },
  });
  if (duplicate && duplicate.id !== preset.id) {
    res.status(409).json({ error: "Cette heure de base existe déjà" });
    return;
  }

  const updated = await prisma.schedulePreset.update({
    where: { id: preset.id },
    data: { startTime, endTime },
  });
  res.json(updated);
});

schedulePresetsRouter.delete("/:id", requireAdmin, async (req, res) => {
  const organizationId = req.session.organizationId!;
  const preset = await prisma.schedulePreset.findFirst({ where: { id: req.params.id, organizationId } });
  if (!preset) {
    res.status(404).json({ error: "Heure de base introuvable" });
    return;
  }

  await prisma.schedulePreset.delete({ where: { id: preset.id } });
  res.status(204).send();
});
