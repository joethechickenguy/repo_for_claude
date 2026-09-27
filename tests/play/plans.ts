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

import { dynamoHabit, shopHabit } from "./workshops";

export const STAGE3: StagePlan = {
  people: [
    ...STAGE2.people.filter(([j]) => !["quarry_stone", "mine_coal", "mine_iron_ore"].includes(j)),
    ["mine_iron_ore", 900], ["mine_coal", 300], ["quarry_stone", 100], ["turn_parts", 150], ["blow_steel", 25], ["mine_mineral", 100],
    ["make_glass", 30], ["make_sulfuric_acid", 20], ["make_cement", 60],
  ],
  train: { trade: "machinists_trained", people: 100 },
  picks: ["rails_wagonways", "steam_engine_house"],
  daily(g) {
    shopHabit(g);
    dynamoHabit(g);
  },
};
