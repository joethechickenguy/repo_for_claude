// Middling plans for the bot (tests/play/bot.ts): people per job, options taken, workshop scripts.
import type { StagePlan } from "./bot";

export const STAGE1: StagePlan = {
  people: [
    ["gather_wood", 2700], ["knap_flint", 1000], ["dig_clay", 600], ["fire_pottery", 200],
    ["burn_charcoal", 500], ["mine_malachite", 300], ["smelt_copper", 400], ["cast_copper_tools", 300],
  ],
  picks: ["hafted_blades", "coppice_near_woods", "eastern_outcrop", "pot_bellows"],
  only: ["digging_sticks", "pit_kiln", "charcoal_clamps", "trail_green_stones", "crucibles_blowpipes", "stone_molds", "arsenical_copper"],
};

export const STAGE2: StagePlan = {
  people: [
    ["gather_wood", 2800], ["knap_flint", 300], ["dig_clay", 300], ["fire_pottery", 50], ["burn_charcoal", 1000],
    ["mine_malachite", 100], ["smelt_copper", 100], ["cast_copper_tools", 0], ["mine_iron_ore", 500],
    ["smelt_iron_bloom", 300], ["smith_bloom", 100], ["forge_iron_tools", 60], ["quarry_stone", 150], ["burn_lime", 50],
    ["run_blast_furnace", 200], ["mine_coal", 150], ["coke_coal", 100], ["run_coke_furnace", 100], ["bail_mine", 200],
    ["tend_engine", 20],
  ],
  picks: ["hillside_ore", "far_seam", "drainage_adit", "boring_mill"],
  skip: ["savery_pump"],
};

import { campaignHabit, dynamoHabit, liquefierHabit, rocketEngineHabit, rocketHabit, shopHabit } from "./workshops";

/** Stage 3: iron tools and coal free people from wood, flint and clay; the new works get crews. */
const STAGE3_PEOPLE: [string, number][] = [
  ["gather_wood", 2800], ["knap_flint", 0], ["dig_clay", 150], ["fire_pottery", 20], ["burn_charcoal", 1000],
  ["mine_malachite", 100], ["smelt_copper", 100], ["cast_copper_tools", 0], ["mine_iron_ore", 900],
  ["smelt_iron_bloom", 100], ["smith_bloom", 50], ["forge_iron_tools", 60], ["quarry_stone", 100], ["burn_lime", 50],
  ["run_blast_furnace", 200], ["mine_coal", 300], ["coke_coal", 100], ["run_coke_furnace", 150], ["bail_mine", 100],
  ["tend_engine", 20], ["turn_parts", 150], ["blow_steel", 25], ["mine_mineral", 100], ["make_glass", 30],
  ["make_sulfuric_acid", 20], ["make_cement", 60],
];

/** The bot stays on the people tier: foremen and departments are the player's call (tests/ui/worksTier.test.ts covers them). */
const TIER_NODES = ["foremen", "departments"];

export const STAGE3: StagePlan = {
  people: STAGE3_PEOPLE,
  skip: TIER_NODES,
  train: { trade: "machinists_trained", people: 100 },
  picks: ["rails_wagonways", "steam_engine_house"],
  energyJob: "run_coke_furnace",
  daily(g) {
    shopHabit(g);
    dynamoHabit(g);
  },
};

export const STAGE4: StagePlan = {
  people: [
    ...STAGE3_PEOPLE.filter(([j]) => !["mine_coal"].includes(j)),
    ["mine_coal", 700], ["run_power_station", 60], ["run_arc_furnace", 20], ["make_alloy_steel", 30],
    ["make_soda_ash", 20], ["electrolyze_brine", 30],
  ],
  train: { trade: "machinists_trained", people: 50 },
  skip: TIER_NODES,
  picks: ["linde_liquefier", "tool_steel"],
  energyJob: "run_power_station",
  daily(g) {
    shopHabit(g);
    dynamoHabit(g);
    liquefierHabit(g);
  },
};

/** Stage 5: the power station carries the energy number now, so the wood, charcoal and bloomery crews go to building. */
export const STAGE5: StagePlan = {
  people: [
    ["gather_wood", 800], ["dig_clay", 150], ["burn_charcoal", 300], ["mine_malachite", 150], ["smelt_copper", 150],
    ["mine_iron_ore", 900], ["forge_iron_tools", 60], ["quarry_stone", 250], ["burn_lime", 50], ["run_blast_furnace", 50],
    ["mine_coal", 1000], ["coke_coal", 150], ["run_coke_furnace", 300], ["bail_mine", 50], ["tend_engine", 20],
    ["turn_parts", 150], ["blow_steel", 60], ["mine_mineral", 100], ["make_glass", 30], ["make_sulfuric_acid", 20],
    ["make_cement", 250], ["run_power_station", 150], ["run_arc_furnace", 20], ["make_alloy_steel", 30],
    ["make_soda_ash", 20], ["electrolyze_brine", 30], ["pump_crude", 60], ["refine_crude", 60],
    ["farm_fuel_crops", 150], ["ferment_and_distill", 60],
  ],
  train: { trade: "rocket_engineers_trained", people: 50 },
  skip: TIER_NODES,
  picks: ["gas_generator_turbopump", "hypergolic_propellants"],
  energyJob: "run_power_station",
  daily(g) {
    shopHabit(g);
    dynamoHabit(g);
    liquefierHabit(g);
    rocketEngineHabit(g);
  },
};

export const STAGE6: StagePlan = {
  ...STAGE5,
  picks: ["radio_command_guidance"],
  decisionWorkshops: ["test_campaign"],
  daily(g) {
    shopHabit(g);
    dynamoHabit(g);
    liquefierHabit(g);
    rocketEngineHabit(g);
    rocketHabit(g);
    campaignHabit(g);
  },
};
