export type Tier = "c" | "u" | "r" | "h" | "dr" | "ur" | "ir" | "sir" | "hr" | "sh" | "e" | "promo";
export type Era = "vintage" | "classic" | "mid" | "modern";
export type Condition = "NM" | "LP" | "MP" | "HP" | "DMG";
export type Company = "PSA" | "BGS" | "CGC";
export type SealedType = "pack" | "bundle" | "etb" | "box" | "bb" | "minitin" | "tin" | "blister" | "collection";

export interface SetInfo {
  id: string; name: string; series: string; rel: string; total: number; printed: number; ptcgo: string | null;
  era: Era; open: boolean; packSize: number; tiers: Partial<Record<Tier, number>>; symbolUrl: string; logoUrl: string;
}
export interface RawCard { n: string; c: string; r: string; t: Tier; s: string; p?: number; v?: string; u?: string; pr?: number; st?: string[]; ty?: string; im?: string }
export interface Card {
  id: string; setId: string; name: string; number: string; rarity: string; tier: Tier; supertype: string;
  price: number | null; variant: string | null; priceUpdated: string | null; revPrice: number | null; types: string | null; imgUrl: string; imgLarge: string;
}
export interface RawSealed { id: number; n: string; set: string | null; grp: string; pub: string; t: SealedType; packs: number; m: number; lo: number | null; exc: boolean }
export interface Product {
  id: string; name: string; setId: string | null; group: string; pub: string; type: SealedType; packs: number;
  market: number; low: number | null; exclusive: boolean; img: string | null; imgRemote: string | null; derived: boolean;
}
export interface PackSlot { n: number; t: Record<string, number> }
export interface SetOdds { source: string; era: Era; slots: PackSlot[] }
export interface RawCatalog { sets: SetInfo[]; cardsBySet: Record<string, RawCard[]>; sealed: RawSealed[]; odds: Record<string, SetOdds> }

export type Variant = "std" | "rev";
export interface Grade { co: Company; g: number; sub: number }
export interface InvItem {
  id: string; kind: "card" | "sealed"; ref: string; cond: Condition; variant: Variant; qty: number;
  cost: number;            // total cost basis in cents for the whole stack
  acq: number; grade?: Grade; note?: string;
}
export type EventKind = "hype" | "tournament" | "reprint" | "shortage";
export interface MarketEvent { id: number; day: number; kind: EventKind; target: string; cardMag: number; sealedMag: number; tau: number; text: string }
export interface MarketState { g: number[]; events: MarketEvent[]; nextEvent: number }
export interface PriceOverride { p: number; upd: string; src: string; anchor: number }
export interface SaleListing { id: string; kind: "card" | "sealed"; ref: string; cond: Condition; variant: Variant; qty: number; ask: number; cost: number; day: number; grade?: Grade }
export interface GradeCardSnap { ref: string; cond: Condition; variant: Variant; cost: number }
export interface GradeSub { id: string; co: Company; tier: string; cards: GradeCardSnap[]; sub: number; ret: number; fee: number; done: boolean; results?: { ref: string; g: number; cost: number; cond: Condition; variant: Variant }[] }
export interface LogBuy { day: number; kind: string; name: string; ref: string; qty: number; cents: number }
export interface LogSell { day: number; name: string; ref: string; qty: number; gross: number; fee: number; net: number; cost: number; how: string }
export interface PullEntry { day: number; setId: string; productName: string; cards: { ref: string; v: Variant; val: number }[]; value: number; cost: number }
export interface GarageItem { kind: "card" | "sealed"; ref: string; cond: Condition; variant: Variant; qty: number }
export interface GarageListing {
  id: string; type: "single" | "lot" | "binder" | "garage" | "sealedlot"; seller: string; title: string; desc: string;
  items: GarageItem[]; shown: number;   // how many items' photos are shown
  ask: number; floor: number; firmness: number; trueValue: number; claimedValue: number; condNote: string;
  risky: boolean; posted: number; expires: number; offers: number; sniped: boolean; visited: boolean; gas: number;
  mood: string;
}
export interface Settings {
  sfx: boolean; music: boolean; musicVol: number; sfxVol: number; animSpeed: number; scale: number; theme: string;
  updateFreq: "manual" | "launch" | "daily"; offline: boolean; sources: Record<string, boolean>;
  autoBackup: boolean; backupEveryDays: number;
}
export interface WorkState { today: number; streak: number; workedToday: boolean; shifts: Record<string, number>; lastWorkDay: number }
export interface Stats {
  packsOpened: number; cardsCollected: number; cardsSold: number; highestPull: { ref: string; value: number; day: number } | null;
  earnedWork: number; earnedSales: number; spent: number; realizedProfit: number; shiftsWorked: number; boxesOpened: number;
  gradedCount: number; psa10: number; garageDeals: number;
}
export interface GameState {
  v: number; startDate: string; day: number; hour: number; cash: number; rng: number; nextId: number;
  inv: InvItem[]; listings: SaleListing[]; grading: GradeSub[]; market: MarketState;
  overrides: Record<string, PriceOverride>; gradedOverrides: Record<string, number>; productOverrides: Record<string, PriceOverride>;
  buys: LogBuy[]; sells: LogSell[]; pulls: PullEntry[];
  stats: Stats; achievements: Record<string, number>; work: WorkState;
  shopBought: Record<string, number>; dealsBought: Record<string, number>;
  garage: GarageListing[]; nw: { day: number; cash: number; inv: number }[];
  settings: Settings; news: { day: number; text: string }[]; sourceUpdated: Record<string, string>;
  toasts: { id: number; text: string }[]; seenIntro: boolean;
}
export const COND_ORDER: Condition[] = ["NM", "LP", "MP", "HP", "DMG"];
export const COND_NAME: Record<Condition, string> = { NM: "Near Mint", LP: "Lightly Played", MP: "Moderately Played", HP: "Heavily Played", DMG: "Damaged" };
export const COND_MULT: Record<Condition, number> = { NM: 1, LP: 0.85, MP: 0.7, HP: 0.5, DMG: 0.3 };
export const TIER_NAME: Record<Tier, string> = { c: "Common", u: "Uncommon", r: "Rare", h: "Holo Rare", dr: "Double Rare / ex / V", ur: "Ultra Rare", ir: "Illustration Rare", sir: "Special Illustration Rare", hr: "Hyper / Secret Rare", sh: "Shiny / Radiant", e: "Energy", promo: "Promo" };
export const TIER_RANK: Record<Tier, number> = { e: 0, c: 1, u: 2, r: 3, promo: 3, h: 4, sh: 5, dr: 5, ir: 6, ur: 7, sir: 8, hr: 9 };
