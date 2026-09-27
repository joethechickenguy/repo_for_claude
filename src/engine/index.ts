/**
 * Engine core (package A): the public interface packages B, C, D, F and H code against.
 *
 * ## Model
 * One tick is one day. `new Engine(content)` starts a run; `engine.tick()` simulates a day and
 * returns a {@link TickReport}. Everything is deterministic: no randomness, no wall clock, content
 * order everywhere. {@link Clock} turns real time into ticks at 0.5x/1x/2x and never stops; when a system asks
 * for the player (`ctx.pause`), it drops to 0.5x and carries on.
 *
 * Each tick, in order:
 * 1. **Staffing** by labor tier (people: the player's counts; works: facilities staffed to their
 *    targets in list order; departments: works staffed in department priority order). Pinned rows
 *    are never touched; every row is recorded in `report.staffing`.
 * 2. **Tools**: coverage = tools / tool users (capped at 1); tool jobs run at
 *    `bare + (1 - bare) x coverage`.
 * 3. **Production**, jobs in content order. Throughput = people x tool efficiency x `rate` modifiers.
 *    A job short of an input runs at the fraction it can supply (consumers pull at the rate they run).
 *    Jobs in a `pull` works are capped so output never exceeds consumer demand + claims + a small
 *    buffer. Player-set jobs (people tier) are not capped: surplus piles up visibly.
 * 4. **Tool wear**: users take the longest-lived tools first; each user-day wears 1/life of a tool.
 * 5. **Spoilage** of perishable resources (wood, charcoal, clay).
 * 6. **Training**: idle person-days accrue toward trained people in the chosen trade (a count var).
 * 7. **Bindings**: `tool_wear`, `metal_tools`, `jobs_active`, `works_active`, `year` updated.
 * 8. **Systems** run (B's projects, F's pressures, H's campaign) with a {@link TickContext}: they
 *    take labor from pools (`build`), spend resources, write state, and may ask for a pause.
 *
 * ## Hooks for package B (nodes)
 * - Stock queries: `engine.stock(id)`, `engine.stocks()`, `engine.canAfford(cost)`.
 * - Spending: `engine.spend(cost)` (atomic; false if short), `engine.addStock(id, n)` (milestone finds).
 * - Build labor per tick: register an {@link EngineSystem}; in `tick(ctx)` call
 *   `ctx.takeLabor("build", amount)`. Unused Build labor is lost at the end of the tick.
 *   `ctx.report.labor.build` is what Build produced today.
 * - `writes_state`: `engine.applyWritesState(ids, values)` (flags default to true).
 * - Expressions: `engine.resolve(name)` returns a state var, a resource stock or a metric.
 * - Jobs: `engine.unlockJob(id)` on node completion; `engine.setModifier(...)` for effects.
 * - Demand: `engine.setClaim(nodeId, cost)` while a node waits for resources (pull works fill it).
 *
 * ## Hooks for package D (shell)
 * `engine.assign(job, n)`, `engine.idle()`, `engine.staffing()`, `engine.addWorks`,
 * `engine.setWorksTarget`, `engine.pin`, `engine.setDepartmentPriority`, `engine.setTrainingTrade`,
 * `engine.report` (stock, produced, consumed, requested per resource), `engine.onTick`, the {@link Clock},
 * and {@link saveToStorage} / {@link loadFromStorage}.
 *
 * ## Package C
 * Models are pure and don't import the engine. Energy reads `report.burned` (fuel burned for work).
 *
 * ## Save / load
 * `engine.save()` is a JSON-safe deep copy (engine state plus each system's `save()`); `Engine.load`
 * restores it, and systems registered afterwards get their data back via `load()`. Loading mid-run
 * gives identical subsequent ticks.
 *
 * @module
 */

export { Engine, EngineError } from "./engine";
export type { EngineSystem, TickContext, TickListener } from "./engine";
export { ProjectsSystem, BUILD_POOL } from "./projects";
export type { ProjectsOptions } from "./projects";
export { EnergySystem, ENERGY_METRIC, WORK_KW_METRIC, ELECTRICITY_KW_METRIC } from "./energy";
export { contentFromTree, TRADE_PATTERN } from "./content";
export type { EngineExtras, TreeContent } from "./content";
export { Clock, browserScheduler } from "./clock";
export type { ClockSpeed, DecisionEvent, DecisionListener, Scheduler } from "./clock";
export { StateStore, StateError, initialValue, checkValue } from "./state";
export { staff, rowKey, worksJobs } from "./labor";
export type { StaffingInput, StaffingResult } from "./labor";
export {
  serialize,
  deserialize,
  saveToStorage,
  loadFromStorage,
  DEFAULT_SAVE_KEY,
} from "./save";
export type { SaveStorage } from "./save";
export {
  DEFAULT_PARAMS,
  DEFAULT_BINDINGS,
  DAYS_PER_YEAR,
  CLOCK_SPEEDS,
  DECISION_SPEED,
  BARE_HAND_EFFICIENCY,
  DEFAULT_SPOIL_PER_DAY,
  TRAINING_PERSON_DAYS_PER_PERSON,
  PULL_BUFFER_DAYS,
  PULL_REFILL_DAYS,
} from "./params";
export type * from "./types";
