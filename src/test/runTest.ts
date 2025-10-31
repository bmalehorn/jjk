import path from "path";
import fs from "fs/promises";
import os from "os";

import { runTests } from "@vscode/test-electron";
import { execJJPromise } from "./utils";

async function prepareWorkspace(): Promise<{
  workspacePath: string;
  userDataDir: string;
  extensionsDir: string;
}> {
  const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "jjk-test-"));
  const userDataDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "jjk-test-user-")
  );
  const extensionsDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "jjk-test-ext-")
  );

  console.log(`Creating test repo in ${workspacePath}`);
  await execJJPromise("git init", {
    cwd: workspacePath,
  });

  const settingsDir = path.join(workspacePath, ".vscode");
  await fs.mkdir(settingsDir, { recursive: true });
  await fs.writeFile(path.join(settingsDir, "settings.json"), "{}\n", "utf8");

  // Update operation log so Source Control refresh picks up the repository
  await execJJPromise("status", {
    cwd: workspacePath,
  });

  return { workspacePath, userDataDir, extensionsDir };
}

async function main() {
  try {
    const { workspacePath, userDataDir, extensionsDir } =
      await prepareWorkspace();

    const extensionDevelopmentPath = path.resolve(__dirname, "../../");
    const extensionTestsPath = path.resolve(__dirname, "./runner.js");

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        workspacePath,
        "--disable-extensions",
        "--disable-workspace-trust",
        `--user-data-dir=${userDataDir}`,
        `--extensions-dir=${extensionsDir}`,
      ],
      extensionTestsEnv: {
        ...process.env,
        JJK_TEST_MODE: "1",
        JJK_TEST_WORKSPACE: workspacePath,
        JJK_TEST_USER_DATA_DIR: userDataDir,
        JJK_TEST_EXT_DIR: extensionsDir,
      },
    });
  } catch (err) {
    console.error(err);
    console.error("Failed to run tests");
    process.exit(1);
  }
}

void main();
