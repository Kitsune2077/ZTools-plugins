import { describe, expect, it } from "vitest";

import { historyFixture } from "@pasteboard-pro/contract-fixtures";
import type { PasteItem } from "@pasteboard-pro/core";

import type { CanonicalClipboardRecord } from "../preload/clipboard-store";
import {
  PasteStackRuntime,
  prepareStackItem,
  writePreparedStackItem,
} from "../preload/paste-stack-runtime";
import { ZToolsPasteStackStore } from "../preload/paste-stack-store";

function record(item: Partial<PasteItem>): CanonicalClipboardRecord {
  return {
    item: item as PasteItem,
    origin: { host: "sync", remoteAvailable: true },
  };
}

describe("paste stack runtime", () => {
  it("prepares rich text before plain text and rejects unavailable remote blobs", () => {
    expect(prepareStackItem(record({
      kind: "rich_text",
      payload: { revision: "1", text: "Hello", html: "<b>Hello</b>" },
    }))).toEqual({ type: "html", text: "Hello", html: "<b>Hello</b>" });
    expect(prepareStackItem(record({ kind: "image", payload: { revision: "1" } }))).toBeNull();
  });

  it("writes text synchronously so the current system paste sees the queued item", () => {
    const writes: string[] = [];
    const clipboard = {
      write() { throw new Error("unexpected html write"); },
      writeText(text: string) { writes.push(text); },
      writeImage() { throw new Error("unexpected image write"); },
      writeBuffer() { throw new Error("unexpected file write"); },
    };
    const nativeImage = {
      createFromPath() { throw new Error("unexpected image load"); },
    };

    expect(writePreparedStackItem(
      { type: "text", text: "first queued value" },
      clipboard,
      nativeImage,
    )).toBe(true);
    expect(writes).toEqual(["first queued value"]);
  });

  it("consumes one persisted item for every released Command-V press", async () => {
    let document: Record<string, unknown> | undefined;
    const stackStore = new ZToolsPasteStackStore({
      async get() {
        if (document === undefined) throw { status: 404 };
        return structuredClone(document);
      },
      async put(next) {
        document = { ...structuredClone(next), _rev: "1-test" };
        return { ok: true };
      },
    });
    await stackStore.put({
      direction: "forward",
      itemIds: ["text-old", "url-middle"],
    });
    const records = new Map<string, CanonicalClipboardRecord>(
      historyFixture
        .filter((item) => item.id === "text-old" || item.id === "url-middle")
        .map((item) => [
          item.id,
          {
            item: structuredClone(item) as PasteItem,
            origin: { host: "sync" as const, remoteAvailable: true },
          },
        ]),
    );
    const writes: string[] = [];
    let pasteHandler: (() => boolean) | undefined;
    const changes: string[][] = [];
    const runtime = new PasteStackRuntime(
      stackStore,
      {
        async findRecordByItemId(itemId) {
          return records.get(itemId);
        },
      },
      {
        write(data) { writes.push(data.html ?? data.text ?? ""); },
        writeText(text) { writes.push(text); },
        writeImage() { throw new Error("unexpected image write"); },
        writeBuffer() { throw new Error("unexpected file write"); },
      },
      {
        createFromPath() { throw new Error("unexpected image load"); },
      },
      {
        start(callback) { pasteHandler = callback; },
        stop() { pasteHandler = undefined; },
      },
      (state) => changes.push([...state.itemIds]),
    );

    await runtime.initialize();
    expect(pasteHandler?.()).toBe(true);
    expect(pasteHandler?.()).toBe(true);

    expect(writes).toEqual([
      "Invoice #1042 is due on July 31 for USD 480.00.",
      "<a href=\"https://billing.example.test/invoice/1042\">Open invoice 1042</a>",
    ]);
    expect(changes.at(-1)).toEqual([]);
  });
});
