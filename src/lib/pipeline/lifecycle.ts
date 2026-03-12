import { runPipeline, type RunOptions, type RunResult } from "./runner";

let controller: AbortController | null = null;
let currentRun: Promise<RunResult> | null = null;

export function isRunning(): boolean {
  return currentRun !== null;
}

export function abortCurrentRun(): void {
  if (controller) {
    controller.abort();
    controller = null;
    currentRun = null;
  }
}

export function startNewRun(options?: Omit<RunOptions, "signal">): Promise<RunResult> {
  abortCurrentRun();

  controller = new AbortController();
  const signal = controller.signal;

  const promise = runPipeline({ ...options, signal }).finally(() => {
    // Clear state when run completes (naturally or via abort)
    if (currentRun === promise) {
      controller = null;
      currentRun = null;
    }
  });

  currentRun = promise;
  return promise;
}
