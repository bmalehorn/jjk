import * as assert from "assert";
import * as path from "path";
import * as fs from "fs/promises";
import * as vscode from "vscode";

import { WorkspaceSourceControlManager } from "../repository";
import {
  execJJPromise,
  getTestWorkspacePath,
  resetWorkspaceDirectory,
  waitFor,
} from "./utils";

type ExtensionTestApi = {
  getWorkspaceSourceControlManager(): WorkspaceSourceControlManager;
};

suite("Extension Activation", () => {
  const workspacePath = getTestWorkspacePath();

  test("registers JJ Source Control with working copy entries", async () => {
    const extension = vscode.extensions.getExtension("jjk.jjk");
    assert.ok(extension, "Extension jjk.jjk not found");

    const api = (await extension.activate()) as ExtensionTestApi | undefined;
    assert.ok(api, "Extension did not return test API");

    const workspaceSCM = api.getWorkspaceSourceControlManager();
    assert.ok(workspaceSCM, "WorkspaceSourceControlManager not available");

    await resetWorkspaceDirectory(workspacePath);
    await workspaceSCM.refresh();
    assert.ok(
      workspaceSCM.repoSCMs.length > 0,
      "Expected at least one repository to be detected"
    );

    const repoSCM = workspaceSCM.repoSCMs[0];

    const markerPath = path.join(
      workspacePath,
      `activation-test-${Date.now().toString(36)}.txt`
    );

    try {
      await fs.writeFile(markerPath, "activation test content\n", "utf8");
      await execJJPromise("status", {
        cwd: workspacePath,
      });

      await repoSCM.checkForUpdates();

      await waitFor(
        () => repoSCM.workingCopyResourceGroup.resourceStates.length > 0,
        {
          timeout: 20_000,
          interval: 250,
          message: "waiting for working copy resource states",
        }
      );

      assert.strictEqual(
        repoSCM.sourceControl.id,
        "jj",
        "Expected registered Source Control id to be 'jj'"
      );
      assert.ok(
        repoSCM.workingCopyResourceGroup.resourceStates.length > 0,
        "Expected working copy to contain file statuses"
      );
    } finally {
      await resetWorkspaceDirectory(workspacePath);
      await workspaceSCM.refresh();
    }
  });
});
