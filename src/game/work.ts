import { GameState } from "../types";
import { fail, rnd } from "../util";
import { earn, toast } from "./state";

export interface Job { id: string; name: string; blurb: string; wage: number; tax: number; cost: number; minShifts: number }
export const JOBS: Job[] = [
  { id: "cashier", name: "Corner Store Cashier", blurb: "Steady, boring, predictable. Small hourly wage.", wage: 700, tax: 0.1, cost: 0, minShifts: 0 },
  { id: "odd", name: "Neighborhood Odd Jobs", blurb: "Yard work and errands. Occasional extra tips.", wage: 750, tax: 0.0, cost: 40, minShifts: 0 },
  { id: "delivery", name: "Local Delivery Driver", blurb: "Pay swings with demand. Gas eats into earnings.", wage: 900, tax: 0.1, cost: 110, minShifts: 3 },
  { id: "freelance", name: "Online Freelance (transcription)", blurb: "Starts low, improves as your skill grows.", wage: 400, tax: 0.15, cost: 0, minShifts: 0 },
];
export const MAX_PAID_HOURS = 5;
export const DAY_HOURS = 16;
export function level(d: GameState, id: string) { return Math.floor((d.work.shifts[id] || 0) / 4); }
export function hourlyBase(d: GameState, j: Job): number {
  const lv = level(d, j.id);
  if (j.id === "freelance") return j.wage + 45 * Math.min(lv, 10);
  return Math.round(j.wage * (1 + 0.02 * Math.min(lv, 10)));
}
export function streakFactor(d: GameState): number { return d.work.streak > 3 ? Math.max(0.7, 1 - 0.06 * (d.work.streak - 3)) : 1; }
export function unlocked(d: GameState, j: Job) { return d.stats.shiftsWorked >= j.minShifts; }
export interface ShiftResult { gross: number; tax: number; cost: number; net: number; tips: number; hours: number; note: string }
export function workShift(d: GameState, jobId: string, hours: number): ShiftResult {
  const j = JOBS.find((x) => x.id === jobId); if (!j) fail("Unknown job");
  if (!unlocked(d, j)) fail(`Work ${j.minShifts} shifts anywhere to unlock this job`);
  if (hours < 1 || hours > MAX_PAID_HOURS) fail("Invalid shift length");
  if (d.work.today + hours > MAX_PAID_HOURS) fail(`Only ${MAX_PAID_HOURS} paid hours are available per day (you have ${MAX_PAID_HOURS - d.work.today} left today)`);
  if (d.hour + hours > DAY_HOURS) fail("Not enough hours left today");
  let rate = hourlyBase(d, j);
  let note = "A quiet shift.";
  if (j.id === "delivery") { rate = Math.round(rate * (0.65 + rnd(d) * 0.8)); note = rate > 950 ? "Busy night: lots of orders." : rate < 750 ? "Slow night: few orders." : "Average night."; }
  let gross = Math.round(rate * hours * streakFactor(d));
  let tips = 0;
  if (j.id === "cashier" && rnd(d) < 0.15) { tips = 100 + Math.round(rnd(d) * 200); note = "A customer left a tip."; }
  if (j.id === "odd" && rnd(d) < 0.3) { tips = 300 + Math.round(rnd(d) * 900); note = "A neighbor paid extra for a tidy job."; }
  gross += tips;
  const tax = Math.round(gross * j.tax); const cost = Math.round(j.cost * hours);
  const net = Math.max(0, gross - tax - cost);
  earn(d, net);
  d.stats.earnedWork += net; d.stats.shiftsWorked++;
  d.work.today += hours; d.work.workedToday = true; d.work.shifts[j.id] = (d.work.shifts[j.id] || 0) + 1;
  if (streakFactor(d) < 1) note += " You're worn out from working so many days in a row (reduced pay).";
  d.hour += hours;
  return { gross, tax, cost, net, tips, hours, note };
}
