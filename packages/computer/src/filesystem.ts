import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { dirname, join, normalize, relative, resolve, sep } from "node:path";
import type { FileStat, Filesystem } from "./types.ts";

/**
 * Workspace-scoped filesystem. All paths resolve under workspaceRoot.
 * Path traversal outside the workspace is rejected.
 */
export class LocalFilesystem implements Filesystem {
  constructor(readonly workspaceRoot: string) {
    mkdirSync(workspaceRoot, { recursive: true });
  }

  resolveSafe(inputPath: string): string {
    const root = resolve(this.workspaceRoot);
    const cleaned = inputPath.replace(/^[/\\]+/, "");
    const target = resolve(root, cleaned || ".");
    const rel = relative(root, target);

    if (rel.startsWith("..") || normalize(rel) === `..${sep}`) {
      throw new Error(`Path escapes workspace: ${inputPath}`);
    }
    // Absolute paths that don't stay under root
    if (resolve(target) !== target && !target.startsWith(root)) {
      throw new Error(`Path escapes workspace: ${inputPath}`);
    }
    if (!target.startsWith(root + sep) && target !== root) {
      // On Windows, compare case-insensitively
      const rootLower = root.toLowerCase();
      const targetLower = target.toLowerCase();
      if (!targetLower.startsWith(rootLower + sep.toLowerCase()) && targetLower !== rootLower) {
        throw new Error(`Path escapes workspace: ${inputPath}`);
      }
    }
    return target;
  }

  async readFile(path: string): Promise<string> {
    return readFileSync(this.resolveSafe(path), "utf8");
  }

  async writeFile(path: string, content: string): Promise<void> {
    const full = this.resolveSafe(path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, "utf8");
  }

  async appendFile(path: string, content: string): Promise<void> {
    const full = this.resolveSafe(path);
    mkdirSync(dirname(full), { recursive: true });
    appendFileSync(full, content, "utf8");
  }

  async listDir(path: string): Promise<string[]> {
    const full = this.resolveSafe(path);
    return readdirSync(full);
  }

  async exists(path: string): Promise<boolean> {
    try {
      return existsSync(this.resolveSafe(path));
    } catch {
      return false;
    }
  }

  async mkdir(path: string): Promise<void> {
    mkdirSync(this.resolveSafe(path), { recursive: true });
  }

  async remove(path: string): Promise<void> {
    const full = this.resolveSafe(path);
    if (full === resolve(this.workspaceRoot)) {
      throw new Error("Refusing to remove workspace root");
    }
    rmSync(full, { recursive: true, force: true });
  }

  async stat(path: string): Promise<FileStat> {
    const full = this.resolveSafe(path);
    const st = statSync(full);
    return {
      path: relative(this.workspaceRoot, full) || ".",
      isFile: st.isFile(),
      isDirectory: st.isDirectory(),
      size: st.size,
      modifiedAt: st.mtimeMs,
    };
  }
}

export function joinWorkspace(root: string, ...parts: string[]): string {
  return join(root, ...parts);
}
