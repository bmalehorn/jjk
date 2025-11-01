import * as assert from "assert";
import * as path from "path";
import * as fs from "fs/promises";

import { execJJPromise, getTestWorkspacePath } from "./utils";
import { getExtensionApi, restoreOriginalOperation } from "./extensionUtils";

suite("Source Control Manager Status", () => {
  const workspacePath = getTestWorkspacePath();

  test("shows parent and working copy file statuses", async () => {
    await restoreOriginalOperation(workspacePath);
    const api = await getExtensionApi();

    const workspaceSCM = api.getWorkspaceSourceControlManager();

    const repoSCM = workspaceSCM.repoSCMs[0];
    assert.ok(repoSCM, "No repository source control manager found");
    const file1Path = path.join(workspacePath, "file1.txt");
    const file2Path = path.join(workspacePath, "file2.txt");

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

    await repoSCM.checkForUpdates();
    const workingCopyLabel = repoSCM.workingCopyResourceGroup.label;
    const hasFile2 = repoSCM.workingCopyResourceGroup.resourceStates.some(
      (state) => state.resourceUri.fsPath.endsWith("file2.txt")
    );
    assert.ok(
      /Working Copy .*add file2\.txt/.test(workingCopyLabel) && hasFile2
    );

    const parentGroup = repoSCM.parentResourceGroups.find((group) =>
      /Parent Commit .*add file1\.txt/.test(group.label)
    );
    if (!parentGroup) {
      return false;
    }
    assert.ok(
      parentGroup.resourceStates.some((state) =>
        state.resourceUri.path.endsWith("/file1.txt")
      )
    );
  });
});
