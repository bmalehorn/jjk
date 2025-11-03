import { sep } from "path";
import { Event, Disposable, window, TabInputTextDiff } from "vscode";
import { logger } from "./logger";

export const isMacintosh = process.platform === "darwin";
export const isWindows = process.platform === "win32";

export function dispose<T extends Disposable>(disposables: T[]): T[] {
  disposables.forEach((d) => void d.dispose());
  return [];
}

export function toDisposable(dispose: () => void): Disposable {
  return { dispose };
}

export function combinedDisposable(disposables: Disposable[]): Disposable {
  return toDisposable(() => dispose(disposables));
}

export function filterEvent<T>(
  event: Event<T>,
  filter: (e: T) => boolean
): Event<T> {
  return (
    listener: (e: T) => any, // eslint-disable-line @typescript-eslint/no-explicit-any
    thisArgs?: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    disposables?: Disposable[]
  ) => event((e) => filter(e) && listener.call(thisArgs, e), null, disposables); // eslint-disable-line @typescript-eslint/no-unsafe-return
}

export function anyEvent<T>(...events: Event<T>[]): Event<T> {
  return (
    listener: (e: T) => unknown,
    thisArgs?: unknown,
    disposables?: Disposable[]
  ) => {
    const result = combinedDisposable(
      events.map((event) => event((i) => listener.call(thisArgs, i)))
    );

    disposables?.push(result);

    return result;
  };
}

export function onceEvent<T>(event: Event<T>): Event<T> {
  return (
    listener: (e: T) => unknown,
    thisArgs?: unknown,
    disposables?: Disposable[]
  ) => {
    const result = event(
      (e) => {
        result.dispose();
        return listener.call(thisArgs, e);
      },
      null,
      disposables
    );

    return result;
  };
}

export function eventToPromise<T>(event: Event<T>): Promise<T> {
  return new Promise<T>((c) => onceEvent(event)(c));
}

function normalizePath(path: string): string {
  // Windows & Mac are currently being handled
  // as case insensitive file systems in VS Code.
  if (isWindows || isMacintosh) {
    return path.toLowerCase();
  }

  return path;
}

export function isDescendant(parent: string, descendant: string): boolean {
  if (parent === descendant) {
    return true;
  }

  if (parent.charAt(parent.length - 1) !== sep) {
    parent += sep;
  }

  return normalizePath(descendant).startsWith(normalizePath(parent));
}

export function pathEquals(a: string, b: string): boolean {
  return normalizePath(a) === normalizePath(b);
}

/**
 * Creates a throttled version of an async function that ensures the underlying
 * function (`fn`) is called at most once concurrently.
 *
 * If the throttled function is called while `fn` is already running:
 * - It schedules `fn` to run again immediately after the current run finishes.
 * - Only one run can be scheduled this way.
 * - If called multiple times while a run is active and another is scheduled,
 *   the arguments for the scheduled run are updated to the latest arguments provided.
 * - The promise returned by calls made while active/scheduled will resolve or
 *   reject with the result of the *next* scheduled run.
 *
 * @template T The return type of the async function's Promise.
 * @template A The argument types of the async function.
 * @param fn The async function to throttle.
 * @returns A new function that throttles calls to `fn`.
 */
export function createThrottledAsyncFn<T, A extends unknown[]>(
  fn: (...args: A) => Promise<T>
): (...args: A) => Promise<T> {
  enum State {
    Idle,
    Running,
    Queued,
  }
  let state = State.Idle;
  let queuedArgs: A | null = null;
  // Promise returned to callers who triggered the queued run
  let queuedRunPromise: Promise<T> | null = null;
  let queuedRunResolver: ((value: T) => void) | null = null;
  let queuedRunRejector:
    | Parameters<ConstructorParameters<typeof Promise>["0"]>["1"]
    | null = null;

  const throttledFn = (...args: A): Promise<T> => {
    queuedArgs = args; // Always store the latest args for a potential queued run

    if (state === State.Running || state === State.Queued) {
      // If already running or queued, ensure we are in Queued state
      // and return the promise for the queued run.
      if (state !== State.Queued) {
        state = State.Queued;
        queuedRunPromise = new Promise<T>((resolve, reject) => {
          queuedRunResolver = resolve;
          queuedRunRejector = reject;
        });
      }
      // This assertion is safe because we ensure queuedRunPromise is set when state becomes Queued.
      return queuedRunPromise!;
    }

    // State is Idle, transition to Running
    state = State.Running;
    // Execute with current args. Capture the promise for this specific run.
    const runPromise = fn(...args);

    // Set up the logic to handle completion of the current run
    runPromise.then(
      (_result) => {
        // --- Success path ---
        if (state === State.Queued) {
          // A run was queued while this one was running.
          const resolver = queuedRunResolver!;
          const rejector = queuedRunRejector!;
          const nextArgs = queuedArgs!; // Use the last stored args

          // Reset queue state *before* starting the next run
          queuedRunPromise = null;
          queuedRunResolver = null;
          queuedRunRejector = null;
          queuedArgs = null;
          state = State.Idle; // Temporarily Idle, the recursive call below will set it back to Running

          // Start the next run recursively.
          // Link its result back to the promise we returned to the queued caller(s).
          throttledFn(...nextArgs).then(resolver, rejector);
        } else {
          // No run was queued, simply return to Idle state.
          state = State.Idle;
        }
        // Note: We don't return the result here; the original runPromise already holds it.
      },
      (error) => {
        // --- Error path ---
        if (state === State.Queued) {
          // A run was queued, but the current one failed.
          // Reject the promise that was returned to the queued caller(s).
          const rejector = queuedRunRejector!;

          // Reset queue state
          queuedRunPromise = null;
          queuedRunResolver = null;
          queuedRunRejector = null;
          queuedArgs = null;
          state = State.Idle;

          rejector(error); // Reject the queued promise
        } else {
          // No run was queued, simply return to Idle state.
          state = State.Idle;
        }
        // Note: We don't re-throw the error here; the original runPromise already handles rejection.
      }
    );

    // Return the promise for the *current* execution immediately.
    return runPromise;
  };

  return throttledFn;
}

export function getActiveTextEditorDiff(): TabInputTextDiff | undefined {
  const activeTextEditor = window.activeTextEditor;
  if (!activeTextEditor) {
    return undefined;
  }

  const activeTab = window.tabGroups.activeTabGroup.activeTab;
  if (!activeTab) {
    return undefined;
  }

  // detecting a diff editor: https://github.com/microsoft/vscode/issues/15513
  const isDiff =
    activeTab.input instanceof TabInputTextDiff &&
    (activeTab.input.modified?.toString() ===
      activeTextEditor.document.uri.toString() ||
      activeTab.input.original?.toString() ===
        activeTextEditor.document.uri.toString());

  if (!isDiff) {
    return undefined;
  }

  return activeTab.input;
}

type Waiter<T> = {
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

export class Lock {
  // make a new promise, which is immediately resolves - start in "unlocked" state.
  lockPromise: Promise<unknown> = new Promise((resolve) => resolve(null));

  // when an entry is not present, there are no promises waiting for that or running it.
  // When an entry is `[]`, that means the check's in the mail - there's a promise that will update it later.
  // Each entry in the list is a Promise that wants that return value.
  // When the queued function returns, it will resolve all those promises with the returned value (or reject them if rejected).
  deduplicationKeyToWaiters: Map<string, Waiter<unknown>[]> = new Map();

  // It might also not be correct that if you have 5 messages enqueued, they all
  // get the same result as the 1st caller. I might instead want to have the
  // first 4 callers get a cached result, but the final one to re-run the
  // command so someone gets a completely up-to-date result. Think "running
  // blame on every keystroke" - you want to make sure you run blame on the
  // final result at least once. lodash.debounce or a similar method might do
  // this.

  // fulfilled & rejection are handled the same way, the same rejection is
  // passed to both. Note that the same object will be returned in both cases,
  // so you'll probably want to not modify the object result - avoid returning
  // something consumable. I think this does not apply to us because this is
  // only used to return a `Buffer` object that we do not modify, only call
  // .toString() on.

  // It might also be nicer to make make this accept an object, or do an overload, to make
  // deduplicationKey explicit.
  acquire<T>(fn: () => Promise<T>, deduplicationKey?: string): Promise<T> {
    logger.info(
      `acquire: deduplicationKey=${deduplicationKey}, this.deduplicationKeyToWaiters=${JSON.stringify(Array.from(this.deduplicationKeyToWaiters.entries()))}`
    );
    if (!deduplicationKey) {
      this.lockPromise = this.lockPromise.then(fn, fn);
      return this.lockPromise as Promise<T>;
    }

    const waiters = this.deduplicationKeyToWaiters.get(deduplicationKey);
    logger.info(`acquire: waiters=${JSON.stringify(waiters)}`);
    if (waiters !== undefined) {
      logger.info(`acquire: waiters present. Enqueueing myself & stopping.`);
      // Make a new Promise, put it in the queue, and return that
      let waiter: Waiter<T> | null = null;
      const promise = new Promise<T>((resolve, reject) => {
        waiter = { resolve, reject };
      });
      if (waiter === null) {
        throw new Error(
          `Waiter should not be null here, should have been set by Promise(). Is that not called synchronously?`
        );
      }
      waiters.push(waiter);
      return promise;
    }

    // now, waiters is undefined.
    // This means I am the first to handle this request.
    // Let's start by registering that and setting waiters to [].
    this.deduplicationKeyToWaiters.set(deduplicationKey, []);

    // This function is called when it's this function's "turn".
    const promiseCallback = async (): Promise<T> => {
      logger.info(
        `acquire: promiseCallback for deduplicationKey='${deduplicationKey}`
      );

      let outcome:
        | {
            isResolved: true;
            result: T;
          }
        | {
            isResolved: false;
            reason: unknown;
          };
      try {
        const result = await fn();
        outcome = { isResolved: true, result };
      } catch (reason) {
        outcome = { isResolved: false, reason };
      }
      const waiters = this.deduplicationKeyToWaiters.get(deduplicationKey);
      if (waiters === undefined) {
        throw new Error(
          `waitersAfterRun was undefined on completion of deduplicationKey='${deduplicationKey}', but the contract is that it should remain a list until this promise is completed. How did it get set to undefined?`
        );
      }
      const resolveOrRejectAllWaiters = () => {
        logger.info(
          `acquire: resolveOrRejectAllWaiters for deduplicationKey='${deduplicationKey}', waiters.length=${waiters.length}, outcome.isResolved=${outcome.isResolved}`
        );
        if (outcome.isResolved) {
          for (const waiter of waiters) {
            waiter.resolve(outcome.result);
          }
        } else {
          for (const waiter of waiters) {
            waiter.reject(outcome.reason);
          }
        }
      };
      // By calling with setTimeout(resolveOrRejectAllWaiters, 0), we only resolve
      // the other waiters after this current call is resolved. So, all acquisitions
      // will be resolved in the order they were called.
      // I think in our current use this doesn't matter, but it makes sense that
      // call #1 should return before call #2, especially if call #1 is the one
      // providing the value for call #2.
      setTimeout(resolveOrRejectAllWaiters, 0);

      // With all waiters handled, reset the state.
      this.deduplicationKeyToWaiters.delete(deduplicationKey);

      // Finally, return the result we acquired earlier.
      if (outcome.isResolved) {
        return outcome.result;
      } else {
        throw outcome.reason;
      }
    };

    this.lockPromise = this.lockPromise.then(promiseCallback, promiseCallback);
    return this.lockPromise as Promise<T>;
  }
}
