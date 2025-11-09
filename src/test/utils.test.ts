import * as assert from "assert";
import { Lock, Deduplicator } from "../utils";

suite("utils", () => {
  test("Lock: should make things run in sequence", async () => {
    const lock = new Lock();
    const events: string[] = [];

    async function runFunction(returnValue: string, sleepTime: number) {
      const result = await lock.acquire(async () => {
        events.push(`start ${returnValue}`);
        await new Promise((resolve) => setTimeout(resolve, sleepTime));
        events.push(`end ${returnValue}`);
        return returnValue;
      });
      // assert no crossed wires - we got the result we returned, not from
      // another call.
      assert.equal(returnValue, result);
    }
    await Promise.all([
      runFunction("1", 100),
      runFunction("2", 200),
      runFunction("3", 100),
    ]);

    assert.deepEqual(events, [
      "start 1",
      "end 1",
      "start 2",
      "end 2",
      "start 3",
      "end 3",
    ]);
  });

  test("Deduplicator: should deduplicate the same messages and return the same results", async () => {
    const deduplicator = new Deduplicator();
    const events: string[] = [];
    const results: string[] = [];

    async function runFunction(returnValue: string, sleepTime: number) {
      // use deduplicationKey of the return value
      const result = await deduplicator.run(returnValue, async () => {
        events.push(`start ${returnValue}`);
        await new Promise((resolve) => setTimeout(resolve, sleepTime));
        events.push(`end ${returnValue}`);
        return returnValue;
      });

      // assert no crossed wires - we got the result we returned, not from
      // another call.
      assert.equal(returnValue, result);
      results.push(result);
    }
    await Promise.all([
      runFunction("1", 100),
      runFunction("2", 200),
      runFunction("1", 100),
    ]);

    assert.deepEqual(events, ["start 1", "start 2", "end 1", "end 2"]);
    // all results were accounted for.
    assert.deepEqual([...results].sort(), ["1", "1", "2"]);
  });
});
