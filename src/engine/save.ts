// Save/load: a save is JSON. Browser saves go to localStorage (no backend).
import { Engine } from "./engine";
import type { EngineContent, SaveGame } from "./types";

/** The part of the Web Storage API saves use; localStorage in the browser, a Map-backed fake in tests. */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const DEFAULT_SAVE_KEY = "bootstrap.save";

export function serialize(engine: Engine): string {
  return JSON.stringify(engine.save());
}

export function deserialize(content: EngineContent, text: string): Engine {
  return Engine.load(content, JSON.parse(text) as SaveGame);
}

export function saveToStorage(engine: Engine, storage: SaveStorage, key = DEFAULT_SAVE_KEY): void {
  storage.setItem(key, serialize(engine));
}

/** The saved run, or null if there is none. Register systems after loading to restore their data. */
export function loadFromStorage(content: EngineContent, storage: SaveStorage, key = DEFAULT_SAVE_KEY): Engine | null {
  const text = storage.getItem(key);
  return text === null ? null : deserialize(content, text);
}
