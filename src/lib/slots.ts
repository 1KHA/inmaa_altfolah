/**
 * Availability slots are ALWAYS 15 minutes (SLOT_STEP_MINUTES). Any range a
 * mentor or admin submits — a click-and-drag over two hours, an unaligned
 * 10:07–10:40 — is normalised to the 15-minute grid and split into one row per
 * slot here, so a single oversized availability row can never be created.
 */
import { prisma } from './prisma';
import { SLOT_STEP_MINUTES } from './constants';

const STEP_MS = SLOT_STEP_MINUTES * 60_000;
/** Longest range accepted in one request (a full working day of slots). */
export const MAX_SLOTS_PER_REQUEST = 48;

export type SlotWindow = { startTime: Date; endTime: Date };

export type SplitResult =
  | { ok: true; slots: SlotWindow[] }
  | { ok: false; error: string };

/** Floor to the grid (start) / ceil to the grid (end), then cut into slots. */
export function splitIntoSlots(startInput: unknown, endInput: unknown): SplitResult {
  const start = new Date(String(startInput));
  const end = new Date(String(endInput));
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { ok: false, error: 'صيغة الوقت غير صالحة' };
  }
  const from = Math.floor(start.getTime() / STEP_MS) * STEP_MS;
  const to = Math.ceil(end.getTime() / STEP_MS) * STEP_MS;
  if (to <= from) {
    return { ok: false, error: 'وقت النهاية يجب أن يكون بعد وقت البداية' };
  }
  const count = (to - from) / STEP_MS;
  if (count > MAX_SLOTS_PER_REQUEST) {
    return { ok: false, error: `لا يمكن إضافة أكثر من ${MAX_SLOTS_PER_REQUEST} فترة (${(MAX_SLOTS_PER_REQUEST * SLOT_STEP_MINUTES) / 60} ساعة) في المرة الواحدة` };
  }
  const slots: SlotWindow[] = [];
  for (let t = from; t < to; t += STEP_MS) {
    slots.push({ startTime: new Date(t), endTime: new Date(t + STEP_MS) });
  }
  return { ok: true, slots };
}

/**
 * Create the 15-minute rows for a range, skipping windows the mentor already
 * has (dragging over an existing slot must not duplicate it).
 */
export async function createSlotsForMentor(
  mentorId: string,
  startInput: unknown,
  endInput: unknown
): Promise<
  | { ok: true; created: Array<{ id: string; startTime: Date; endTime: Date; mentorId: string }>; skipped: number }
  | { ok: false; error: string }
> {
  const split = splitIntoSlots(startInput, endInput);
  if (!split.ok) return split;

  const rangeStart = split.slots[0].startTime;
  const rangeEnd = split.slots[split.slots.length - 1].endTime;
  const existing = await prisma.mentorAvailability.findMany({
    where: { mentorId, startTime: { lt: rangeEnd }, endTime: { gt: rangeStart } },
    select: { startTime: true },
  });
  const taken = new Set(existing.map((e) => e.startTime.getTime()));
  const fresh = split.slots.filter((s) => !taken.has(s.startTime.getTime()));

  const created: Array<{ id: string; startTime: Date; endTime: Date; mentorId: string }> = [];
  for (const s of fresh) {
    created.push(
      await prisma.mentorAvailability.create({
        data: { mentorId, startTime: s.startTime, endTime: s.endTime },
        select: { id: true, startTime: true, endTime: true, mentorId: true },
      })
    );
  }
  return { ok: true, created, skipped: split.slots.length - fresh.length };
}
