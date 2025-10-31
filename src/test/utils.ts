import { exec } from "child_process";
import { inspect } from "util";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Gets the jj executable path to use in tests.
 * Uses environment variable JJ_PATH if set, otherwise defaults to "jj".
 */
export function getJJPath(): string {
  return process.env.JJ_PATH || "jj";
}

export function execPromise(
  command: string,
  options?: Parameters<typeof exec>["1"],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(command, { timeout: 1000, ...options }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
      }
    });
  });
}

/**
 * Executes a jj command using the configured jj path.
 */
export function execJJPromise(
  args: string,
  options?: Parameters<typeof exec>["1"],
): Promise<{ stdout: string; stderr: string }> {
  const jjPath = getJJPath();
  const command = `${jjPath} ${args}`;
  return execPromise(command, options);
}

export function getTestWorkspacePath(): string {
  const workspace = process.env.JJK_TEST_WORKSPACE;
  if (!workspace) {
    throw new Error("Expected JJK_TEST_WORKSPACE to be set for tests");
  }
  return workspace;
}

type WaitForOptions = {
  timeout?: number;
  interval?: number;
  message?: string;
};

function renderUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    const serialized = JSON.stringify(error);
    if (serialized) {
      return serialized;
    }
  } catch {
    // ignore
  }
  return inspect(error);
}

export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  { timeout = 10_000, interval = 200, message }: WaitForOptions = {},
): Promise<void> {
  const start = Date.now();
  let lastError: unknown;

  while (Date.now() - start < timeout) {
    try {
      if (await predicate()) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  const detail = message ? ` (${message})` : "";
  if (lastError) {
    throw new Error(
      `Timed out waiting for condition${detail}: ${renderUnknownError(lastError)}`,
    );
  }
  throw new Error(`Timed out waiting for condition${detail}`);
}

export async function resetWorkspaceDirectory(
  workspacePath: string,
): Promise<void> {
  const entries = await fs.readdir(workspacePath);
  await Promise.all(
    entries.map((entry) =>
      fs.rm(path.join(workspacePath, entry), { recursive: true, force: true }),
    ),
  );

  await execJJPromise("git init", {
    cwd: workspacePath,
    timeout: 5_000,
  });
  const settingsDir = path.join(workspacePath, ".vscode");
  await fs.mkdir(settingsDir, { recursive: true });
  await fs.writeFile(path.join(settingsDir, "settings.json"), "{}\n", "utf8");
  await execJJPromise("status", {
    cwd: workspacePath,
    timeout: 5_000,
  });
}
