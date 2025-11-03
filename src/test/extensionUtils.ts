// utils that have access to the extension itself
import * as assert from "assert";
import * as vscode from "vscode";
import type { ExtensionApi } from "../main";
import { execJJPromise } from "./testUtils";

export async function getExtensionApi(): Promise<ExtensionApi> {
  // Gets the running extension, refreshes it, and returns it.
  // Maybe this should be a beforeEach / afterEach or something, idk.
  const extension = vscode.extensions.getExtension("jjk.jjk");
  assert.ok(extension, "Extension jjk.jjk not found");

  const api = (await extension.activate()) as ExtensionApi | undefined;
  assert.ok(api, "Extension did not return test API");

  await api.getWorkspaceSourceControlManager().refresh();
  return api;
}

export async function restoreOriginalOperation(
  workspacePath: string
): Promise<void> {
  const originalOperationId = process.env.JJK_TEST_INITIAL_OPERATION_ID;
  assert.ok(originalOperationId, "JJK_TEST_INITIAL_OPERATION_ID is not set");
  await execJJPromise(`operation restore ${originalOperationId}`, {
    cwd: workspacePath,
  });
}
