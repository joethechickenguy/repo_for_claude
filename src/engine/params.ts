// Engine tuning defaults. Content overrides any of them via EngineContent.params; these exist so the
// engine runs before the YAML carries the numbers (see tech-tree/open-questions.md, engine section).
import type { EngineParams, StateBindings } from "./types";

/** Days per in-game year (calendar, not an estimate). */
export const DAYS_PER_YEAR = 365;

/**
 * Estimate. Stage 1's tool_wear pressure: "Workers without a tool drop to quarter speed". The same
 * value as the Stage 1 prototype. Belongs in the YAML as a number; until then this is the default.
 */
export const BARE_HAND_EFFICIENCY = 0.25;

/**
 * Estimate (play value). Wood, charcoal and clay left in the open lose 0.1% a day: a half-life near
 * two years, enough to make a forgotten pile shrink without being the fix for stockpiles
 * (DESIGN.md: pull-based production is).
 */
export const DEFAULT_SPOIL_PER_DAY = 0.001;

/**
 * Estimate (play value). A year of idle time trains one person in a trade: 1,000 idle people add
 * about three trained people a day. Teachers scale it through a `training` modifier.
 */
export const TRAINING_PERSON_DAYS_PER_PERSON = 365;

/** Estimate (play value). Pull-based producers keep two days of consumer demand as a buffer. */
export const PULL_BUFFER_DAYS = 2;

/** Estimate (play value). A pull works closes a gap to claims + buffer over 30 days, not at once. */
export const PULL_REFILL_DAYS = 30;

export const DEFAULT_PARAMS: EngineParams = {
  bareHandEfficiency: BARE_HAND_EFFICIENCY,
  defaultSpoilPerDay: DEFAULT_SPOIL_PER_DAY,
  trainingPersonDaysPerPerson: TRAINING_PERSON_DAYS_PER_PERSON,
  pullBufferDays: PULL_BUFFER_DAYS,
  pullRefillDays: PULL_REFILL_DAYS,
};

/** The ids in `state-variables.yaml` the engine maintains. */
export const DEFAULT_BINDINGS: StateBindings = {
  toolCoverage: "tool_wear",
  metalTools: "metal_tools",
  jobsActive: "jobs_active",
  worksActive: "works_active",
  laborTier: "labor_tier",
  year: "year",
};

/** Clock speeds: in-game days per real second (DESIGN.md: one second is one day at 1x). */
export const CLOCK_SPEEDS = [1, 5, 20] as const;
