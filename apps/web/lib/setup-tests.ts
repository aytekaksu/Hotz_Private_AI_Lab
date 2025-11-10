/**
 * Shared Bun test bootstrap.
 * Extend this file with any globals/mocks that Bun should load before specs.
 */
if (!process.env.NODE_ENV) {
  Object.assign(process.env, { NODE_ENV: 'test' });
}
