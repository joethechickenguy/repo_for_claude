// Energy per person each tick: fuel burned for work (report.burned) through package C's
// energyPerPerson, kept as the `energy_w_per_person` metric that gates read.
import { energyPerPerson, type FuelBurnKgPerDay, type FuelKind } from "../models/energy";
import type { EngineSystem, TickContext } from "./engine";

/** Metric the gates' `energy_w_per_person` conditions read. */
export const ENERGY_METRIC = "energy_w_per_person";
/** Metrics other systems set for shaft work and electricity delivered (kW). */
export const WORK_KW_METRIC = "work_kw";
export const ELECTRICITY_KW_METRIC = "electricity_kw";

export class EnergySystem implements EngineSystem {
  readonly id = "energy";

  /** `fuels` maps a resource id to the fuel it is when burned (`{wood_kg: "wood", charcoal_kg: "charcoal"}`). */
  constructor(private readonly fuels: Readonly<Record<string, FuelKind>>) {}

  tick(ctx: TickContext): void {
    const e = ctx.engine;
    const fuel: FuelBurnKgPerDay = {};
    for (const [resource, kind] of Object.entries(this.fuels)) {
      const kg = ctx.report.burned[resource] ?? 0;
      if (kg > 0) fuel[kind] = (fuel[kind] ?? 0) + kg;
    }
    const b = energyPerPerson({
      fuel_kg_per_day: fuel,
      work_kw: e.metric(WORK_KW_METRIC) ?? 0,
      electricity_kw: e.metric(ELECTRICITY_KW_METRIC) ?? 0,
      population: e.population,
    });
    e.setMetric(ENERGY_METRIC, b.energy_w_per_person);
  }
}
