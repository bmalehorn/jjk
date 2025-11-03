import path from "path";
import fs from "fs/promises";
import os from "os";

import { runTests } from "@vscode/test-electron";
import { execJJPromise } from "./testUtils";

async function prepareWorkspace(): Promise<{
  workspacePath: string;
  userDataDir: string;
  extensionsDir: string;
  initialOperationId: string;
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

  await fs.writeFile(
    path.join(workspacePath, ".gitignore"),
    ".vscode/\n",
    "utf8"
  );
  const settingsDir = path.join(workspacePath, ".vscode");
  await fs.mkdir(settingsDir, { recursive: true });
  await fs.writeFile(path.join(settingsDir, "settings.json"), "{}\n", "utf8");
  // Update operation log so Source Control refresh picks up the repository
  await execJJPromise("describe -m 'prepareWorkspace'", { cwd: workspacePath });
  await execJJPromise("new", { cwd: workspacePath });
  const opLogOutput = await execJJPromise(
    "operation log --limit 1 --no-graph --template 'self.id()'",
    {
      cwd: workspacePath,
    }
  );
  const initialOperationId = opLogOutput.stdout.trim();

  return { workspacePath, userDataDir, extensionsDir, initialOperationId };
}

async function main() {
  try {
    const { workspacePath, userDataDir, extensionsDir, initialOperationId } =
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
        JJK_TEST_INITIAL_OPERATION_ID: initialOperationId,
      },
    });
  } catch (err) {
    console.error(err);
    console.error("Failed to run tests");
    process.exit(1);
  }
}

void main();
