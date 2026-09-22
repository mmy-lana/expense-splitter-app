/**
 * Minimal assertion harness shared by the verification scripts.
 *
 * Deliberately dependency-free: the engine harness runs the shipped TypeScript
 * sources directly through Node's type stripping, and the UI harness renders the
 * shipped components through a Vite SSR build. Both report through this module so
 * a failure looks identical whichever layer broke.
 */

let passedCount = 0;
const failureMessages: string[] = [];

export function section(title: string): void {
  console.log(`\n${title}`);
}

export function test(name: string, fn: () => void): void {
  try {
    fn();
    passedCount += 1;
    console.log(`  \u2713 ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failureMessages.push(`${name} -> ${message}`);
    console.error(`  \u2717 ${name}\n      ${message}`);
  }
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message} (expected ${String(expected)}, received ${String(actual)})`);
  }
}

/** Asserts that rendered markup (or any string) contains a substring. */
export function assertContains(haystack: string, needle: string, message: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(`${message} (missing ${JSON.stringify(needle)} in: ${truncate(haystack)})`);
  }
}

/** Asserts that rendered markup does NOT contain a substring. */
export function assertAbsent(haystack: string, needle: string, message: string): void {
  if (haystack.includes(needle)) {
    throw new Error(`${message} (unexpected ${JSON.stringify(needle)} in: ${truncate(haystack)})`);
  }
}

/** Asserts two markup strings are not identical (i.e. a state visibly differs). */
export function assertDiffers(left: string, right: string, message: string): void {
  if (left === right) {
    throw new Error(`${message} (both rendered as: ${truncate(left)})`);
  }
}

export function assertThrows(fn: () => unknown, message: string): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error(`${message} (expected a thrown error)`);
}

function truncate(value: string, limit = 320): string {
  return value.length <= limit ? value : `${value.slice(0, limit)}\u2026`;
}

export interface HarnessReport {
  passed: number;
  failed: number;
  failures: string[];
}

export function report(): HarnessReport {
  section('Summary');
  console.log(`  ${passedCount} checks passed, ${failureMessages.length} failed`);

  if (failureMessages.length > 0) {
    console.error('\nFailures:');
    for (const failure of failureMessages) console.error(`  - ${failure}`);
  } else {
    console.log('\nAll verification checks passed.');
  }

  return { passed: passedCount, failed: failureMessages.length, failures: [...failureMessages] };
}

/** Applies the harness outcome to the process exit code. */
export function exitWithReport(): void {
  const result = report();
  if (result.failed > 0) process.exitCode = 1;
}
