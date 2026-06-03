import { describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { discoverFiles } from "../src/preload/file-discovery";

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "image-batch-discovery-"));
}

async function makeImage(filePath: string) {
  await sharp({
    create: {
      width: 12,
      height: 8,
      channels: 4,
      background: "#48a5d8"
    }
  })
    .png()
    .toFile(filePath);
}

async function makeHeif(filePath: string) {
  await sharp({
    create: {
      width: 12,
      height: 8,
      channels: 4,
      background: "#87a5d8"
    }
  })
    .heif({ quality: 80, compression: "av1" })
    .toFile(filePath);
}

describe("file discovery", () => {
  it("discovers HEIF and HEIC image files", async () => {
    const dir = await makeTempDir();
    const heif = path.join(dir, "sample.heif");
    const heic = path.join(dir, "sample.heic");
    await makeHeif(heif);
    await makeHeif(heic);

    const files = await discoverFiles([dir]);

    expect(files.map((file) => file.path).sort()).toEqual([heic, heif].sort());
    expect(files.every((file) => file.type === "image")).toBe(true);
    expect(files.every((file) => file.format === "heif")).toBe(true);
  });

  it("continues scanning when a child directory cannot be read", async () => {
    const dir = await makeTempDir();
    const readable = path.join(dir, "readable.png");
    const blocked = path.join(dir, "blocked");
    const blockedImage = path.join(blocked, "hidden.png");
    await fs.mkdir(blocked);
    await makeImage(readable);

    const originalReaddir = fs.readdir;
    const readdir = vi.spyOn(fs, "readdir");
    readdir.mockImplementation(async (targetPath, options) => {
      if (String(targetPath) === blocked) {
        throw new Error("permission denied");
      }
      return originalReaddir(targetPath, options as never) as unknown as ReturnType<typeof fs.readdir>;
    });

    try {
      const files = await discoverFiles([dir]);

      expect(files.map((file) => file.path)).toEqual([readable]);
      expect(files.some((file) => file.path === blockedImage)).toBe(false);
    } finally {
      readdir.mockRestore();
    }
  });

  it("continues scanning when inspecting one file fails", async () => {
    const dir = await makeTempDir();
    const readable = path.join(dir, "readable.png");
    const unreadable = path.join(dir, "unreadable.pdf");
    await makeImage(readable);
    await fs.writeFile(unreadable, "%PDF-1.4\n");

    const originalStat = fs.stat;
    const stat = vi.spyOn(fs, "stat");
    stat.mockImplementation(async (targetPath, options) => {
      if (path.basename(String(targetPath)) === "unreadable.pdf") {
        throw new Error("file removed while scanning");
      }
      return originalStat(targetPath, options as never) as unknown as ReturnType<typeof fs.stat>;
    });

    try {
      const files = await discoverFiles([dir]);

      expect(files.map((file) => file.path)).toEqual([readable]);
    } finally {
      stat.mockRestore();
    }
  });

  it("does not revisit circular symlinked directories", async () => {
    const dir = await makeTempDir();
    const readable = path.join(dir, "readable.png");
    const nested = path.join(dir, "nested");
    const loop = path.join(nested, "loop");
    await fs.mkdir(nested);
    await makeImage(readable);
    await fs.symlink(dir, loop, "dir");

    const files = await discoverFiles([dir]);

    expect(files.map((file) => file.path)).toEqual([readable]);
  }, 2000);

  it("stops discovery at the configured file limit", async () => {
    const dir = await makeTempDir();
    await makeImage(path.join(dir, "a.png"));
    await makeImage(path.join(dir, "b.png"));
    await makeImage(path.join(dir, "c.png"));

    const files = await discoverFiles([dir], { maxFiles: 2 });

    expect(files).toHaveLength(2);
  });

  it("stops discovery at the configured directory depth", async () => {
    const dir = await makeTempDir();
    const nested = path.join(dir, "nested");
    const tooDeep = path.join(nested, "too-deep");
    await fs.mkdir(tooDeep, { recursive: true });
    await makeImage(path.join(nested, "visible.png"));
    await makeImage(path.join(tooDeep, "hidden.png"));

    const files = await discoverFiles([dir], { maxDepth: 1 });

    expect(files.map((file) => path.basename(file.path))).toEqual(["visible.png"]);
  });
});
