import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { SourceFile } from "../shared/types";

const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".heif", ".heic", ".tif", ".tiff", ".gif"]);
const pdfExtensions = new Set([".pdf"]);
const excludedDirectories = new Set([".git", "node_modules", ".DS_Store"]);
const defaultMaxFiles = 1000;
const defaultMaxDepth = 12;

export interface DiscoveryLimits {
  maxFiles?: number;
  maxDepth?: number;
}

interface DiscoveryState {
  discovered: SourceFile[];
  seen: Set<string>;
  visitedDirectories: Set<string>;
  maxFiles: number;
  maxDepth: number;
}

export function isImagePath(filePath: string): boolean {
  return imageExtensions.has(path.extname(filePath).toLowerCase());
}

export function isPdfPath(filePath: string): boolean {
  return pdfExtensions.has(path.extname(filePath).toLowerCase());
}

export async function discoverFiles(paths: string[], limits: DiscoveryLimits = {}): Promise<SourceFile[]> {
  const state: DiscoveryState = {
    discovered: [],
    seen: new Set<string>(),
    visitedDirectories: new Set<string>(),
    maxFiles: Math.max(1, Math.round(limits.maxFiles ?? defaultMaxFiles)),
    maxDepth: Math.max(0, Math.round(limits.maxDepth ?? defaultMaxDepth))
  };

  for (const itemPath of paths) {
    if (state.discovered.length >= state.maxFiles) break;
    const resolved = path.resolve(itemPath);
    await walk(resolved, state, 0);
  }

  return state.discovered;
}

async function walk(targetPath: string, state: DiscoveryState, depth: number): Promise<void> {
  if (state.discovered.length >= state.maxFiles) return;
  const linkStat = await fs.lstat(targetPath).catch(() => null);
  if (!linkStat) return;

  const realPath = await fs.realpath(targetPath).catch(() => targetPath);
  const stat = linkStat.isSymbolicLink() ? await fs.stat(realPath).catch(() => null) : linkStat;
  if (!stat) return;

  if (stat.isDirectory()) {
    if (depth > state.maxDepth) return;
    if (state.visitedDirectories.has(realPath)) return;
    if (excludedDirectories.has(path.basename(targetPath))) return;
    state.visitedDirectories.add(realPath);
    const children = await fs.readdir(targetPath).catch(() => [] as string[]);
    for (const child of children) {
      if (state.discovered.length >= state.maxFiles) break;
      await walk(path.join(targetPath, child), state, depth + 1);
    }
    return;
  }

  if (!stat.isFile()) return;
  if (!isImagePath(targetPath) && !isPdfPath(targetPath)) return;
  if (state.seen.has(realPath)) return;
  try {
    const file = await inspectFile(targetPath);
    state.seen.add(realPath);
    state.discovered.push(file);
  } catch {
    return;
  }
}

export async function inspectFile(filePath: string): Promise<SourceFile> {
  const stat = await fs.stat(filePath);
  const base = {
    path: filePath,
    name: path.basename(filePath),
    size: stat.size
  };

  if (isPdfPath(filePath)) {
    return { ...base, type: "pdf" };
  }

  if (isImagePath(filePath)) {
    const metadata = await sharp(filePath, { animated: true }).metadata().catch(() => null);
    return {
      ...base,
      type: "image",
      width: metadata?.width,
      height: metadata?.height,
      format: metadata?.format
    };
  }

  return { ...base, type: "unknown" };
}
