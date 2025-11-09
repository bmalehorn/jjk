import * as assert from "assert";
import { parseRenamePaths } from "../repository"; // Adjust path as needed
import { execJJPromise, getTestWorkspacePath } from "./testUtils";
import { getExtensionApi, restoreOriginalOperation } from "./extensionUtils";

import * as fs from "fs/promises";
import path from "path";

suite("repository", () => {
  test("should handle rename with no prefix or suffix", () => {
    const input = "{old => new}";
    const expected = {
      fromPath: "old",
      toPath: "new",
    };
    assert.deepStrictEqual(parseRenamePaths(input), expected);
  });

  test("should handle rename with only suffix", () => {
    const input = "{old => new}.txt";
    const expected = {
      fromPath: "old.txt",
      toPath: "new.txt",
    };
    assert.deepStrictEqual(parseRenamePaths(input), expected);
  });

  test("should handle rename with only prefix", () => {
    const input = "prefix/{old => new}";
    const expected = {
      fromPath: "prefix/old",
      toPath: "prefix/new",
    };
    assert.deepStrictEqual(parseRenamePaths(input), expected);
  });

  test("should handle empty fromPart", () => {
    const input = "src/test/{ => basic-suite}/main.test.ts";
    const expected = {
      fromPath: "src/test/main.test.ts",
      toPath: "src/test/basic-suite/main.test.ts",
    };
    assert.deepStrictEqual(parseRenamePaths(input), expected);
  });

  test("should handle empty toPart", () => {
    const input = "src/{old => }/file.ts";
    const expected = {
      fromPath: "src/old/file.ts",
      toPath: "src/file.ts",
    };
    assert.deepStrictEqual(parseRenamePaths(input), expected);
  });

  test("should parse rename with leading and trailing directories", () => {
    const input = "a/b/{c => d}/e/f.txt";
    const expected = {
      fromPath: "a/b/c/e/f.txt",
      toPath: "a/b/d/e/f.txt",
    };
    assert.deepStrictEqual(parseRenamePaths(input), expected);
  });

  test("should handle extra spaces within curly braces", () => {
    const input = "src/test/{  =>   basic-suite  }/main.test.ts";
    const expected = {
      fromPath: "src/test/main.test.ts",
      toPath: "src/test/basic-suite/main.test.ts",
    };
    assert.deepStrictEqual(parseRenamePaths(input), expected);
  });

  test("should handle paths with dots in segments", () => {
    const input = "src/my.component/{old.module => new.module}/index.ts";
    const expected = {
      fromPath: "src/my.component/old.module/index.ts",
      toPath: "src/my.component/new.module/index.ts",
    };
    assert.deepStrictEqual(parseRenamePaths(input), expected);
  });

  test("should handle paths with spaces", () => {
    // This test depends on how robust the regex is to special path characters.
    // The current regex is simple and might fail with complex characters.
    const input = "src folder/{a b => c d}/file name with spaces.txt";
    const expected = {
      fromPath: "src folder/a b/file name with spaces.txt",
      toPath: "src folder/c d/file name with spaces.txt",
    };
    assert.deepStrictEqual(parseRenamePaths(input), expected);
  });

  test("should return null for simple rename without curly braces", () => {
    const input = "old.txt => new.txt";
    assert.strictEqual(parseRenamePaths(input), null);
  });

  test("should return null for non-rename lines", () => {
    const input = "M src/some/file.ts";
    assert.strictEqual(parseRenamePaths(input), null);
  });

  test("should return null for empty input", () => {
    const input = "";
    assert.strictEqual(parseRenamePaths(input), null);
  });

  const workspacePath = getTestWorkspacePath();

  test("is exposed through the extension api", async () => {
    const api = await getExtensionApi();
    const repositories = api.getRepositories();

    assert.ok(
      repositories.length > 0,
      "Expected at least one JJRepository instance"
    );
    const repositoryRoot = await fs.realpath(repositories[0].repositoryRoot);
    const expectedRoot = await fs.realpath(workspacePath);

    assert.strictEqual(
      repositoryRoot,
      expectedRoot,
      "Expected repository root to match the test workspace path"
    );
  });

  const setupRepository = async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await restoreOriginalOperation(workspacePath);
        break;
      } catch (error) {
        if (
          error instanceof Error &&
          /Concurrent checkout/.test(error.message) &&
          attempt < 4
        ) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          continue;
        }
        throw error;
      }
    }
    const api = await getExtensionApi();
    const repositories = api.getRepositories();
    assert.ok(
      repositories.length === 1,
      "expected only one repository in the test workspace"
    );
    return repositories[0];
  };

  test("showAll", async () => {
    const repository = await setupRepository();
    const file1Path = path.join(workspacePath, "file1.txt");
    await fs.writeFile(file1Path, "file1 contents\n", "utf8");
    await execJJPromise("describe -m 'add file1.txt'", {
      cwd: workspacePath,
    });
    await execJJPromise("new", {
      cwd: workspacePath,
    });
    const file2Path = path.join(workspacePath, "file2.txt");
    await fs.writeFile(file2Path, "file2 contents\n", "utf8");
    await execJJPromise("describe -m 'add file2.txt'", {
      cwd: workspacePath,
    });

    const allChanges = await repository.showAll(["@"]);
    assert.ok(
      allChanges.length === 1,
      "expected exactly 1 changes returned from showAll"
    );
    assert.ok(
      allChanges[0].change.description === "add file2.txt",
      'expected first change description to be "add file2.txt"'
    );
    assert.ok(
      allChanges[0].fileStatuses.length === 1,
      "expected first change to have exactly 1 file status"
    );
    assert.ok(
      allChanges[0].fileStatuses[0].file === "file2.txt",
      'expected first file status file to be "file2.txt"'
    );
    assert.ok(
      allChanges[0].fileStatuses[0].type === "A",
      'expected first file status type to be "A" (added)'
    );
  });

  const getRevAt = async (at: string) => {
    const logOutput = await execJJPromise(
      `log -r '${at}' --no-graph --limit 1 --template 'self.change_id().shortest(8)'`,
      {
        cwd: workspacePath,
      }
    );
    const rev = logOutput.stdout.trim();
    return rev;
  };

  test("annotate", async () => {
    const repository = await setupRepository();

    const filePath = path.join(workspacePath, "file.txt");
    await fs.writeFile(
      filePath,
      "change1 line1\nchange1 line2\nchange1 line3\n",
      "utf8"
    );
    await execJJPromise("describe -m 'add file.txt'", {
      cwd: workspacePath,
    });
    const firstChangeRev = await getRevAt("@");
    await execJJPromise("new", { cwd: workspacePath });
    await fs.writeFile(
      filePath,
      "change1 line1\nchange2 line2\nchange1 line3\n",
      "utf8"
    );
    await execJJPromise("describe -m 'update file.txt'", {
      cwd: workspacePath,
    });
    const secondChangeRev = await getRevAt("@");

    const annotations = await repository.annotate("file.txt", "@");

    assert.ok(
      annotations.length === 3,
      "expected exactly 3 lines of annotation"
    );
    assert.strictEqual(
      annotations[0],
      firstChangeRev,
      "expected line 1 to be attributed to first change"
    );
    assert.strictEqual(
      annotations[1],
      secondChangeRev,
      "expected line 2 to be attributed to second change"
    );
    assert.strictEqual(
      annotations[2],
      firstChangeRev,
      "expected line 3 to be attributed to first change"
    );
  });

  test("getStatus reports added, modified, and deleted files", async () => {
    const repository = await setupRepository();

    const trackedPath = path.join(workspacePath, "tracked.txt");
    const toDeletePath = path.join(workspacePath, "delete-me.txt");
    await fs.writeFile(trackedPath, "tracked contents\n", "utf8");
    await fs.writeFile(toDeletePath, "delete me\n", "utf8");
    await execJJPromise("describe -m 'initial snapshot'", {
      cwd: workspacePath,
    });
    await execJJPromise("new", { cwd: workspacePath });

    await fs.writeFile(trackedPath, "tracked contents\nupdated line\n", "utf8");
    const addedPath = path.join(workspacePath, "added.txt");
    await fs.writeFile(addedPath, "added contents\n", "utf8");
    await fs.rm(toDeletePath);
    await execJJPromise("describe -m 'mixed edits'", {
      cwd: workspacePath,
    });

    const status = await repository.getStatus();
    assert.strictEqual(status.conflictedFiles.size, 0);
    assert.ok(
      status.workingCopy.description === "mixed edits",
      "expected working copy description to match latest describe message"
    );
    assert.ok(
      status.parentChanges.length >= 1 &&
        status.parentChanges[0].description === "initial snapshot",
      "expected parent change description to match base snapshot"
    );

    const fileStatuses = new Map(
      status.fileStatuses.map((fileStatus) => [fileStatus.file, fileStatus])
    );

    const modified = fileStatuses.get("tracked.txt");
    assert.ok(modified, "expected tracked.txt to be reported as modified");
    assert.strictEqual(modified?.type, "M");
    assert.ok(
      modified?.path.endsWith("tracked.txt"),
      "expected absolute path for modified file"
    );

    const added = fileStatuses.get("added.txt");
    assert.ok(added, "expected added.txt to be reported as added");
    assert.strictEqual(added?.type, "A");
    assert.ok(
      added?.path.endsWith("added.txt"),
      "expected absolute path for added file"
    );

    const deleted = fileStatuses.get("delete-me.txt");
    assert.ok(deleted, "expected delete-me.txt to be reported as deleted");
    assert.strictEqual(deleted?.type, "D");
    assert.ok(
      deleted?.path.endsWith("delete-me.txt"),
      "expected absolute path for deleted file"
    );
  });

  test("getStatus parses renames", async () => {
    const repository = await setupRepository();

    const oldPath = path.join(workspacePath, "old-name.txt");
    const newPath = path.join(workspacePath, "new-name.txt");
    await fs.writeFile(oldPath, "original contents\n", "utf8");
    await execJJPromise("describe -m 'add old file'", { cwd: workspacePath });
    await execJJPromise("new", { cwd: workspacePath });

    await fs.rename(oldPath, newPath);
    await execJJPromise("describe -m 'rename file'", { cwd: workspacePath });

    const status = await repository.getStatus();
    const renameStatus = status.fileStatuses.find(
      (entry) => entry.file === "new-name.txt"
    );
    assert.ok(renameStatus, "expected new-name.txt to appear in status");
    assert.strictEqual(renameStatus?.type, "R");
    assert.strictEqual(
      renameStatus?.renamedFrom,
      "old-name.txt",
      "expected rename origin to be parsed"
    );
  });

  test("getStatus surfaces conflicted files from merge parents", async () => {
    const repository = await setupRepository();

    const conflictFile = path.join(workspacePath, "conflict.txt");
    const execWithRetry = async (command: string) => {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          return await execJJPromise(command, { cwd: workspacePath });
        } catch (error) {
          if (
            error instanceof Error &&
            /Concurrent checkout/.test(error.message) &&
            attempt < 4
          ) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            continue;
          }
          throw error;
        }
      }
      throw new Error(`Failed to run '${command}' without concurrent checkout`);
    };

    await fs.writeFile(conflictFile, "base\n", "utf8");
    await execWithRetry("describe -m 'base change'");
    const baseChange = await getRevAt("@");

    await execWithRetry("new");
    await fs.writeFile(conflictFile, "left branch change\n", "utf8");
    await execWithRetry("describe -m 'left change'");
    const leftChange = await getRevAt("@");

    await execWithRetry(`new -r ${baseChange}`);
    await fs.writeFile(conflictFile, "right branch change\n", "utf8");
    await execWithRetry("describe -m 'right change'");
    const rightChange = await getRevAt("@");

    await execWithRetry(`new -r ${leftChange} ${rightChange}`);
    await execWithRetry("describe -m 'merge attempt'");

    const status = await repository.getStatus();
    const hasConflictPath = Array.from(status.conflictedFiles).some((file) =>
      file.endsWith("conflict.txt")
    );
    assert.ok(hasConflictPath, "expected conflict.txt to be recorded");
    assert.strictEqual(
      status.workingCopy.isConflict,
      true,
      "expected working copy to be marked as conflicted"
    );
    assert.strictEqual(
      status.parentChanges.length,
      2,
      "expected merge working copy to have two parents"
    );
    const parentDescriptions = status.parentChanges.map(
      (parent) => parent.description
    );
    assert.ok(
      parentDescriptions.includes("left change"),
      "expected left change in parent descriptions"
    );
    assert.ok(
      parentDescriptions.includes("right change"),
      "expected right change in parent descriptions"
    );
  });

  test("getStatus respects cached results when requested", async () => {
    const repository = await setupRepository();

    const cacheFilePath = path.join(workspacePath, "cache-file.txt");
    await fs.writeFile(cacheFilePath, "cache contents\n", "utf8");
    await execJJPromise("describe -m 'cache base'", { cwd: workspacePath });
    await execJJPromise("new", { cwd: workspacePath });

    const initialStatus = await repository.getStatus(false);
    assert.strictEqual(
      initialStatus.fileStatuses.length,
      0,
      "expected clean working copy initially"
    );

    await fs.writeFile(cacheFilePath, "cache contents updated\n", "utf8");

    const cachedStatus = await repository.getStatus(true);
    assert.strictEqual(
      cachedStatus,
      initialStatus,
      "expected cached status to be reused when useCache=true"
    );
    assert.strictEqual(
      cachedStatus.fileStatuses.length,
      0,
      "expected cached result to ignore new filesystem edits"
    );

    const refreshedStatus = await repository.getStatus(false);
    assert.notStrictEqual(
      refreshedStatus,
      initialStatus,
      "expected refresh to fetch new status data"
    );
    const refreshedEntry = refreshedStatus.fileStatuses.find(
      (entry) => entry.file === "cache-file.txt"
    );
    assert.ok(
      refreshedEntry && refreshedEntry.type === "M",
      "expected modification after refresh"
    );
  });
});
