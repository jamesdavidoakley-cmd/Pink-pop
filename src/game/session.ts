import type { Content } from '../engine/loader';
import { saves, type SaveData, type Settings } from '../engine/save';
import { bus } from '../engine/events';
import type { TopicProgress } from '../engine/save';

/**
 * The live save slot: all persistent progress flows through here.
 * Autosaves on meaningful events and every 20 s of play.
 */
export class Session {
  private autosaveT = 0;

  constructor(
    public readonly slot: number,
    public data: SaveData,
    public settings: Settings,
    private content: Content,
  ) {}

  // ---------- fossils ----------
  get fossilCount(): number { return this.data.fossils.length; }
  hasFossil(id: string): boolean { return this.data.fossils.includes(id); }
  addFossil(id: string, levelId: string): void {
    if (this.hasFossil(id)) return;
    this.data.fossils.push(id);
    bus.emit('FossilCollected', { fossilId: id, levelId, total: this.fossilCount });
    this.save();
  }

  // ---------- chips ----------
  get chipsCarried(): number { return this.data.chipsCarried; }
  addChip(n = 1): void {
    this.data.chipsCarried += n;
    bus.emit('ChipCollected', { carried: this.data.chipsCarried });
  }
  banked(levelId: string): number { return this.data.chipsBanked[levelId] ?? 0; }
  /** Deposit the pocket into a world's bank. Returns the new banked total. */
  bankChips(levelId: string): number {
    const cap = this.content.config.economy.chipsPerWorld;
    const deposit = Math.min(this.data.chipsCarried, cap - this.banked(levelId));
    this.data.chipsBanked[levelId] = this.banked(levelId) + deposit;
    this.data.chipsCarried -= deposit;
    bus.emit('ChipsBanked', { levelId, banked: this.data.chipsBanked[levelId] });
    this.save();
    return this.data.chipsBanked[levelId];
  }

  // ---------- brain power ----------
  get brain(): number { return this.data.brainSegments; }
  setBrain(n: number): void {
    this.data.brainSegments = Math.max(0, Math.min(this.content.config.economy.brainSegments, n));
    bus.emit('BrainPowerChanged', { segments: this.data.brainSegments });
  }

  // ---------- mastery ----------
  topic(topicId: string): TopicProgress {
    let t = this.data.mastery[topicId];
    if (!t) {
      t = { xp: 0, tier: this.content.config.education.tierMin, streak: 0, recentMisses: 0, attempts: 0, correct: 0 };
      this.data.mastery[topicId] = t;
    }
    return t;
  }
  stars(topicId: string): number {
    const xp = this.data.mastery[topicId]?.xp ?? 0;
    const th = this.content.config.education.masteryXpThresholds;
    let s = 0;
    for (const t of th) if (xp >= t) s++;
    return s;
  }
  get masteredTopicCount(): number {
    return Object.keys(this.data.mastery).filter((t) => this.stars(t) >= 1).length;
  }

  // ---------- flags / champions / gadgets ----------
  flag(name: string): boolean { return !!this.data.flags[name]; }
  setFlag(name: string): void { this.data.flags[name] = true; this.save(); }
  isFreed(bossId: string): boolean { return this.data.freedChampions.includes(bossId); }
  freeChampion(bossId: string): void {
    if (this.isFreed(bossId)) return;
    this.data.freedChampions.push(bossId);
    bus.emit('ChampionFreed', { bossId });
    this.save();
  }
  hasGadget(id: string): boolean { return this.data.gadgets.includes(id); }
  addGadget(id: string): void {
    if (this.hasGadget(id)) return;
    this.data.gadgets.push(id);
    bus.emit('GadgetBuilt', { gadgetId: id });
    this.save();
  }

  // ---------- doors ----------
  gateCost(gateKey: string): number { return this.content.config.doors[gateKey] ?? 0; }
  doorOpen(gateKey: string): boolean { return this.fossilCount >= this.gateCost(gateKey); }

  // ---------- lifecycle ----------
  tick(dt: number): void {
    this.data.playtimeSeconds += dt;
    this.autosaveT += dt;
    if (this.autosaveT > 20) { this.autosaveT = 0; this.save(); }
  }

  save(): void {
    saves.save(this.slot, this.data);
  }
}
