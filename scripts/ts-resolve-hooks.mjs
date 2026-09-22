import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const EXTENSIONLESS = /^\.{1,2}\//;

export async function resolve(specifier, context, nextResolve) {
  if (EXTENSIONLESS.test(specifier) && !/\.[cm]?[jt]sx?$/i.test(specifier)) {
    const candidates = [`${specifier}.ts`, `${specifier}.tsx`, `${specifier}/index.ts`];
    for (const candidate of candidates) {
      const url = new URL(candidate, context.parentURL);
      if (existsSync(fileURLToPath(url))) {
        return { url: url.href, shortCircuit: true };
      }
    }
  }
  return nextResolve(specifier, context);
}
