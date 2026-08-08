/** Shared content + runtime types. Content shapes mirror /content/schemas. */

export type Vec3 = [number, number, number];

// ---------- content docs ----------
export interface GameConfig {
  player: {
    runSpeed: number; accelTime: number; airControl: number; gravity: number;
    jumpHeight: number; doubleJumpHeight: number; coyoteTime: number; jumpBuffer: number;
    variableJumpCut: number; spinDuration: number; spinCooldown: number; spinRadius: number; spinDamage: number;
    stompHopTime: number; stompSpeed: number; stompRadius: number; stompDamage: number;
    chompRange: number; spitSpeed: number; spitDamage: number;
    roarChargeTime: number; roarRadius: number; roarStunSeconds: number;
    maxHearts: number; iFramesSeconds: number; capsuleRadius: number; capsuleHeight: number;
    ledgeGrabEnabled: boolean; slopeSlideAngle: number; fallRespawnY: number;
  };
  camera: {
    distanceSteps: number[]; defaultStep: number; height: number; sensitivity: number;
    minPitch: number; maxPitch: number; collisionRadius: number; followLerp: number;
  };
  combat: { hitPauseSeconds: number; knockback: number; telegraphMinSeconds: number; heartDropChance: number; lockOnRange: number };
  bossAI: {
    decisionIntervalMin: number; decisionIntervalMax: number; softmaxBase: number; softmaxTrickeryScale: number;
    topN: number; banRepeatCount: number; banRepeatAggressionExempt: number; habitWindow: number;
    threatBudgetPer10s: number; explorerThreatScale: number; rubberBandDamageThreshold: number; rubberBandScale: number;
    maxPhases: number;
  };
  economy: { chipsPerWorld: number; bonusFossilChips: number; brainSegments: number; chipMagnetRadius: number };
  education: {
    promoteStreak: number; demoteMisses: number; tierMin: number; tierMax: number;
    masteryXpThresholds: number[]; xpFirstTry: number; xpAfterHint: number; xpTaught: number; weakTopicWeight: number;
  };
  doors: Record<string, number>;
  voice: {
    banterIntervalSeconds: number; barkCooldownSeconds: number; duckDb: number;
    minVariants: { companion: Record<string, number>; boss: Record<string, number> };
  };
  difficulty: Record<'explorer' | 'hero', { bonusHearts: number; windupScale: number; phaseCheckpoints: boolean; threatScale: number }>;
  companions: { followDistance: number; catchUpTeleport: number; sniffRadius: number };
  quality: { autoProbeSeconds: number; lowFpsThreshold: number };
}

export interface CharacterDef {
  name: string; role: 'hero' | 'companion' | 'villain' | 'boss' | 'miniboss' | 'prop';
  active: boolean; rig: 'trex' | 'human' | 'dog' | 'cogling' | 'drone'; scale?: number;
  colors: Record<string, string>; subtitleColor: string;
  voice: { rate: number; pitch: number; volume?: number; langPref?: string; namePref?: string[] };
  signature?: string;
}

export interface VoicePack { character: string; pools: Record<string, string[]> }

export interface DialogueLineDef { speaker: string; text: string; emote?: string; delay?: number }
export interface DialogueScene { id: string; once?: boolean; lines: DialogueLineDef[] }

export interface QuestionDef {
  id: string; tier: number; template: string;
  params?: Record<string, { min: number; max: number; multipleOf?: number }>;
  answerExpr?: string; distractorRules?: string[];
  choices?: (string | number)[]; answerIndex?: number;
  askStyles: string[]; hint: string; explain: string;
}
export interface QuestionPack { id: string; strand: string; topic: string; questions: QuestionDef[] }

export interface SortBin { id: string; label: string }
export interface SortItem { id: string; label: string; bin: string; shape?: string; color?: string; fact?: string }
export interface BuildSlotOption { id: string; label: string; value: number }
export interface BuildSlot { id: string; label: string; options: BuildSlotOption[] }
export interface TaskDef {
  id: string; type: 'sortit' | 'measureit' | 'numberpath' | 'quickfire' | 'buildit' | 'circuitit' | 'shadowit' | 'fractionforge';
  title: string; topicId?: string; speaker?: string; intro?: string; success?: string; chain?: string[];
  // sortit
  uniqueBins?: boolean; bins?: SortBin[]; items?: SortItem[];
  // measureit
  mode?: 'jug' | 'balance' | 'money'; unit?: string; step?: number; max?: number;
  targets?: Record<string, number[]>;
  // numberpath
  rule?: { kind: string; of?: number; step?: number; from?: number; digit?: number; place?: string };
  tierRules?: Record<string, { kind: string; of?: number; step?: number; from?: number; digit?: number; place?: string }>;
  length?: number; width?: number;
  // quickfire
  count?: number; topics?: string[]; adaptive?: boolean;
  // buildit
  variant?: 'gears' | 'lever' | 'spring' | 'bones' | 'bracing' | 'cogpuzzle';
  slots?: BuildSlot[];
  goal?: { kind: 'gearSpeed' | 'gearForce' | 'leverBalance' | 'springLaunch' | 'matchSlots'; min?: number; max?: number; loadValue?: number; loadArm?: number; solution?: Record<string, string> };
  goalText?: string; failText?: string;
}

export interface EnemyDef {
  id: string; name: string; hp: number; speed: number;
  behavior: 'scout' | 'brute' | 'tinkerer' | 'buzzer';
  traits?: Record<string, number>; traitNoise?: number;
  attack: { kind: 'projectile' | 'melee' | 'charge' | 'repair'; damage: number; cooldown: number; range?: number; telegraph: number; dizzyOnMiss?: number };
  fleeBelowHp?: number; alertRadius?: number; aggroRadius?: number; scale?: number;
  colors?: Record<string, string>; chompable?: boolean;
}

export interface BossTraits { aggression: number; caution: number; trickery: number; patience: number; showmanship: number }
export interface BossAbility {
  id: string;
  trigger: { type: 'onHpBelow' | 'onTimer' | 'onPlayerStreak' | 'onDistanceHeld' | 'onPhaseEnter' | 'onAllyDown'; value?: number; range?: 'near' | 'mid' | 'far'; seconds?: number };
  effect: string; counter?: string; repeat?: boolean;
}
export interface BossDef {
  id: string; name: string; world?: string; kind?: 'boss' | 'miniboss';
  hp: number; phases: number; traits: BossTraits; traitNoise?: number;
  moveset: string; abilities?: BossAbility[]; gimmick?: Record<string, unknown>;
  voicePack: string; arena: string; fossil?: string;
}

export type MoveTag = 'strike' | 'advance' | 'retreat' | 'block' | 'reposition' | 'feint' | 'taunt' | 'wait' | 'special' | 'ranged';
export type RangeBand = 'near' | 'mid' | 'far';
export interface MoveDef {
  id: string; label?: string; tags: MoveTag[]; baseWeight: number; duration: number;
  telegraph?: number; recovery?: number; cooldown?: number; threat?: number;
  range?: RangeBand | 'any'; damage?: number;
  motion?: { kind: 'lunge' | 'hold' | 'strafe' | 'retreat' | 'approach' | 'leap' | 'vanishStep'; speed?: number };
  hit?: { shape: 'arc' | 'ring' | 'line'; radius?: number; arc?: number; from?: number; to?: number };
  projectile?: { speed?: number; damage?: number; count?: number };
  stance?: 'block' | 'none'; bark?: string;
}
export interface MovesetDef { id: string; moves: MoveDef[] }

export interface GeoItem {
  type: 'box' | 'cyl' | 'ramp'; pos: Vec3; size?: Vec3; r?: number; r2?: number; h?: number; seg?: number;
  rot?: Vec3; color?: string; collide?: boolean; special?: 'cracked' | 'roarwall'; contains?: string;
}
export interface FossilDefC {
  id: string; nameKey: string; type: 'task' | 'secret' | 'platforming' | 'arena' | 'boss' | 'bonus';
  pos?: Vec3; taskId?: string; arenaId?: string; hint?: string; speaker?: string;
}
export interface PortalDef { to: string; pos: Vec3; kind: 'door' | 'exit' | 'arena' | 'walk'; gateKey?: string; labelKey?: string; yaw?: number; color?: string; sealed?: boolean }
export interface MoverDef { kind: 'platform' | 'rotator' | 'conveyor'; pos: Vec3; to?: Vec3; size?: Vec3; r?: number; speed?: number; pause?: number; axis?: 'x' | 'y' | 'z'; dir?: Vec3; color?: string; teeth?: boolean }
export interface HazardDef { kind: 'steam' | 'bumper'; pos: Vec3; period?: number; onTime?: number; height?: number; damage?: number }
export interface ChipGroup { pattern: 'ring' | 'line' | 'cluster' | 'arc'; center?: Vec3; from?: Vec3; to?: Vec3; radius?: number; count: number }
export interface NpcDef { char: string; pos: Vec3; yaw?: number; cutscene?: string; practiceTask?: string; chatPool?: string; requiresFreed?: boolean }
export interface TaskPlacement { ref: string; pos: Vec3; yaw?: number; area?: number }
export interface SecretDef { id: string; pos: Vec3; fossilId?: string }

export interface LevelDef {
  id: string; nameKey: string; subKey?: string; kind: 'hub' | 'world' | 'arena' | 'playground';
  world?: string; gateKey?: string;
  palette: {
    skyTop: string; skyBottom: string; fog: string; fogNear?: number; fogFar?: number;
    sun: string; sunIntensity?: number; ambient: string; ambientIntensity?: number;
  };
  music: string; spawn: Vec3; spawnYaw?: number;
  geometry: GeoItem[];
  props?: { type: string; pos: Vec3; rot?: number; scale?: number; color?: string }[];
  movers?: MoverDef[]; hazards?: HazardDef[]; chips?: ChipGroup[];
  fossils?: FossilDefC[]; enemies?: { archetype: string; pos: Vec3; patrolRadius?: number }[];
  portals?: PortalDef[]; npcs?: NpcDef[]; tasks?: TaskPlacement[];
  checkpoints?: Vec3[]; secrets?: SecretDef[];
  springPads?: { pos: Vec3; power?: number }[]; quizOrbs?: Vec3[];
  boss?: string; bank?: { pos: Vec3 }; garden?: { pos: Vec3 };
  instancedField?: { count: number; center: Vec3; spread: number };
}

export interface MusicDef {
  id: string; tempo: number; root: number; mode: string; swing?: number;
  layers: { wave: string; pattern: (number | null)[]; octave: number; gain: number; decay?: number; role?: string; combatOnly?: boolean }[];
}

// ---------- game events ----------
export interface EventMap {
  FossilCollected: { fossilId: string; levelId: string; total: number };
  ChipCollected: { carried: number };
  ChipsBanked: { levelId: string; banked: number };
  QuestionAsked: { topicId: string; tier: number; questionId: string };
  QuestionAnswered: { topicId: string; correct: boolean; tier: number; firstTry: boolean };
  TaskStarted: { taskId: string };
  TaskCompleted: { taskId: string; fossilId?: string };
  BossPhaseChanged: { bossId: string; phase: number };
  BossDefeated: { bossId: string };
  PlayerDamaged: { amount: number; hearts: number };
  PlayerDizzy: Record<string, never>;
  EnemyDefeated: { archetype: string };
  BrainPowerChanged: { segments: number };
  HeartsChanged: { hearts: number; max: number };
  MasteryChanged: { topicId: string; stars: number; xp: number };
  SecretFound: { secretId: string };
  GadgetBuilt: { gadgetId: string };
  LevelLoaded: { levelId: string };
  DialogueLine: { speaker: string; text: string };
  ChampionFreed: { bossId: string };
  SaveRequested: Record<string, never>;
}
