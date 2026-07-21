import type { DockEdge } from "@pasteboard-pro/design-tokens";

import type { ZToolsDocumentDatabase } from "./clipboard-store";

export type ShelfDockEdge = Exclude<DockEdge, "floating">;

export type WindowPreferences = Readonly<{
  dockEdge: ShelfDockEdge;
}>;

export const defaultWindowPreferences: WindowPreferences = {
  dockEdge: "bottom",
};

const WINDOW_PREFERENCES_ID = "pasteboard-pro:settings:window";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDatabaseStatus(error: unknown, status: number): boolean {
  return (
    isRecord(error) &&
    (error.status === status || error.statusCode === status)
  );
}

function isShelfDockEdge(value: unknown): value is ShelfDockEdge {
  return value === "top" || value === "bottom" || value === "left" || value === "right";
}

function parseWindowPreferences(value: unknown): WindowPreferences | undefined {
  if (!isRecord(value) || !isRecord(value.settings)) return undefined;
  return isShelfDockEdge(value.settings.dockEdge)
    ? { dockEdge: value.settings.dockEdge }
    : undefined;
}

export class ZToolsWindowPreferencesStore {
  constructor(private readonly database: ZToolsDocumentDatabase) {}

  async get(): Promise<WindowPreferences> {
    try {
      return (
        parseWindowPreferences(await this.database.get(WINDOW_PREFERENCES_ID)) ??
        structuredClone(defaultWindowPreferences)
      );
    } catch (error) {
      if (isDatabaseStatus(error, 404)) {
        return structuredClone(defaultWindowPreferences);
      }
      throw error;
    }
  }

  async put(settings: WindowPreferences): Promise<void> {
    if (!isShelfDockEdge(settings.dockEdge)) {
      throw new TypeError("Shelf dock edge must be top, bottom, left, or right");
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      let current: unknown;
      try {
        current = await this.database.get(WINDOW_PREFERENCES_ID);
      } catch (error) {
        if (!isDatabaseStatus(error, 404)) throw error;
      }
      const revision =
        isRecord(current) && typeof current._rev === "string"
          ? current._rev
          : undefined;
      try {
        await this.database.put({
          _id: WINDOW_PREFERENCES_ID,
          ...(revision === undefined ? {} : { _rev: revision }),
          type: "pasteboard-pro-window-preferences",
          settings: structuredClone(settings),
        });
        return;
      } catch (error) {
        if (!isDatabaseStatus(error, 409) || attempt === 2) throw error;
      }
    }
  }
}
