/**
 * `server-only` is a Next.js build-time guard with no runtime behaviour; it
 * doesn't resolve under vitest, so server modules that import it get this
 * no-op instead (see `vitest.config.ts`).
 */
export {};
