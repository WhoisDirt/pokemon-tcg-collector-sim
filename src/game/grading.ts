import { Company, Condition, GameState } from "../types";
import { Catalog } from "./catalog";
import { fail, rnd } from "../util";
import { addItem, pushLog, spend, takeItem, toast, uid } from "./state";
import { rawValue } from "./economy";

export interface GradeTier { id: string; name: string; price: number; days: number; maxValue: number; rank: number }
export const SERVICES: Record<Company, GradeTier[]> = {
  PSA: [
    { id: "value", name: "Value", price: 2499, days: 14, maxValue: 50000, rank: 0 },
    { id: "regular", name: "Regular", price: 4999, days: 7, maxValue: 150000, rank: 0 },
    { id: "express", name: "Express", price: 9999, days: 3, maxValue: Infinity, rank: 1 },
  ],
  BGS: [
    { id: "economy", name: "Economy", price: 2200, days: 14, maxValue: 50000, rank: 0 },
    { id: "standard", name: "Standard", price: 4500, days: 7, maxValue: 150000, rank: 0 },
    { id: "express", name: "Express", price: 9000, days: 3, maxValue: Infinity, rank: 1 },
  ],
  CGC: [
    { id: "economy", name: "Economy", price: 1800, days: 12, maxValue: 50000, rank: 0 },
    { id: "standard", name: "Standard", price: 3000, days: 6, maxValue: 150000, rank: 0 },
    { id: "express", name: "Express", price: 6500, days: 3, maxValue: Infinity, rank: 1 },
  ],
};
export const SHIPPING_FEE = 800;
const W: Record<Condition, number[]> = {
  NM: [0.22, 0.4, 0.22, 0.08, 0.04, 0.02, 0.01, 0.005, 0.003, 0.002],
  LP: [0.02, 0.12, 0.3, 0.28, 0.14, 0.08, 0.03, 0.015, 0.01, 0.005],
  MP: [0, 0.02, 0.1, 0.25, 0.28, 0.18, 0.1, 0.04, 0.02, 0.01],
  HP: [0, 0, 0.02, 0.07, 0.16, 0.26, 0.24, 0.14, 0.07, 0.04],
  DMG: [0, 0, 0, 0.01, 0.04, 0.1, 0.2, 0.28, 0.22, 0.15],
};
export function gradeOdds(cond: Condition): { grade: number; p: number }[] {
  const w = W[cond]; const t = w.reduce((a, b) => a + b, 0);
  return w.map((x, i) => ({ grade: 10 - i, p: x / t }));
}
export function rollGrade(d: { rng: number }, cond: Condition, co: Company): number {
  const w = W[cond].map((x) => x * (0.7 + rnd(d) * 0.6));   // not fully predictable
  const t = w.reduce((a, b) => a + b, 0); let r = rnd(d) * t; let idx = 0;
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) { idx = i; break; } }
  const base = 10 - idx;
  if (co === "PSA") return base;
  if (base === 10) return rnd(d) < (co === "BGS" ? 0.08 : 0.15) ? 10 : 9.5;
  if (base === 9) return rnd(d) < 0.45 ? 9.5 : 9;
  return rnd(d) < 0.5 ? base + 0.5 : base;
}
export function submitGrading(d: GameState, cat: Catalog, co: Company, tierId: string, picks: { invId: string; qty: number }[], rank: number): string {
  const tier = SERVICES[co].find((t) => t.id === tierId); if (!tier) fail("Unknown service level");
  if (tier.rank > rank) fail("Express grading unlocks at Collector rank");
  if (!picks.length) fail("Select at least one card");
  const cards: { ref: string; cond: Condition; variant: any; cost: number }[] = [];
  for (const p of picks) {
    const it = d.inv.find((x) => x.id === p.invId);
    if (!it || it.kind !== "card" || it.grade) fail("Only raw cards can be graded");
    const c = cat.cards.get(it.ref)!;
    if (rawValue(cat, d, c, it.cond, it.variant) > tier.maxValue) fail(`${c.name} exceeds the ${tier.name} tier's declared value limit`);
    for (let i = 0; i < p.qty; i++) {
      const t = takeItem(d, p.invId, 1);
      cards.push({ ref: it.ref, cond: it.cond, variant: it.variant, cost: t.cost });
    }
  }
  const fee = tier.price * cards.length + SHIPPING_FEE;
  spend(d, fee);
  const id = uid(d);
  d.grading.unshift({ id, co, tier: tier.id, cards, sub: d.day, ret: d.day + tier.days, fee, done: false });
  // grading fees increase cost basis of the cards
  const per = Math.round(fee / cards.length); for (const c of cards) c.cost += per;
  return id;
}
export function processGrading(d: GameState, cat: Catalog) {
  for (const sub of d.grading) {
    if (sub.done || sub.ret > d.day) continue;
    sub.done = true; sub.results = [];
    for (const c of sub.cards) {
      const g = rollGrade(d, c.cond, sub.co);
      sub.results.push({ ref: c.ref, g, cost: c.cost, cond: c.cond, variant: c.variant });
      addItem(d, { kind: "card", ref: c.ref, cond: "NM", variant: c.variant, qty: 1, cost: c.cost, grade: { co: sub.co, g, sub: sub.sub } });
      d.stats.gradedCount++; d.stats.cardsCollected--;
      if (sub.co === "PSA" && g === 10) d.stats.psa10++;
    }
    toast(d, `${sub.co} grading returned: ${sub.results.map((r) => r.g).join(", ")}`);
  }
  if (d.grading.length > 60) d.grading = d.grading.filter((x, i) => !x.done || i < 40);
}
