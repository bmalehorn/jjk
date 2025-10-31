import * as assert from "assert";
import * as path from "path";
import * as fs from "fs/promises";
import * as vscode from "vscode";

import type { WorkspaceSourceControlManager } from "../repository";
import {
  execJJPromise,
  getTestWorkspacePath,
  resetWorkspaceDirectory,
  waitFor,
} from "./utils";

type ExtensionTestApi = {
  getWorkspaceSourceControlManager(): WorkspaceSourceControlManager;
};

suite("Source Control Manager Status", () => {
  const workspacePath = getTestWorkspacePath();

  test("shows parent and working copy file statuses", async () => {
    const extension = vscode.extensions.getExtension("jjk.jjk");
    assert.ok(extension, "Extension jjk.jjk not found");

    const api = (await extension.activate()) as ExtensionTestApi | undefined;
    assert.ok(api, "Extension did not return test API");

    const workspaceSCM = api.getWorkspaceSourceControlManager();
    await resetWorkspaceDirectory(workspacePath);
    await workspaceSCM.refresh();

    const repoSCM = workspaceSCM.repoSCMs[0];
    assert.ok(repoSCM, "No repository source control manager found");
    const file1Path = path.join(workspacePath, "file1.txt");
    const file2Path = path.join(workspacePath, "file2.txt");

    try {
      await fs.writeFile(file1Path, "file1\n", "utf8");
      await execJJPromise('describe -m "add file1.txt"', {
        cwd: workspacePath,
      });
      await repoSCM.checkForUpdates();

      await execJJPromise("new", { cwd: workspacePath });
      await repoSCM.checkForUpdates();

      await fs.writeFile(file2Path, "file2\n", "utf8");
      await execJJPromise('describe -m "add file2.txt"', {
        cwd: workspacePath,
      });

      await waitFor(
        async () => {
          await repoSCM.checkForUpdates();
          const workingCopyLabel = repoSCM.workingCopyResourceGroup.label;
          const hasFile2 = repoSCM.workingCopyResourceGroup.resourceStates.some(
            (state) => state.resourceUri.fsPath.endsWith("file2.txt")
          );
          return (
            /Working Copy .*add file2\.txt/.test(workingCopyLabel) && hasFile2
          );
        },
        {
          timeout: 10_000,
          interval: 250,
          message: "waiting for working copy to show file2.txt",
        }
      );

      await waitFor(
        async () => {
          await repoSCM.checkForUpdates();
          const parentGroup = repoSCM.parentResourceGroups.find((group) =>
            /Parent Commit .*add file1\.txt/.test(group.label)
          );
          if (!parentGroup) {
            return false;
          }
          return parentGroup.resourceStates.some((state) =>
            state.resourceUri.path.endsWith("/file1.txt")
          );
        },
        {
          timeout: 10_000,
          interval: 250,
          message: "waiting for parent commit to show file1.txt",
        }
      );
    } finally {
      await resetWorkspaceDirectory(workspacePath);
      await workspaceSCM.refresh();
    }
  });
});
