/**
 * Migration Dry-Run Guard
 * 
 * Enforces strict read-only execution. Any attempt to perform a write
 * operation (INSERT, UPDATE, DELETE, UPSERT, TRUNCATE, ALTER, DROP)
 * while in dry-run mode will trigger a fatal DryRunViolationError.
 */

export class DryRunViolationError extends Error {
  constructor(operation, target) {
    super(`FATAL DRY-RUN VIOLATION: Write operation '${operation}' on target '${target}' is strictly prohibited during Phase 3B dry run.`);
    this.name = 'DryRunViolationError';
    this.operation = operation;
    this.target = target;
  }
}

export function assertDryRunSafety() {
  const mode = process.env.MIGRATION_MODE || 'dry-run';
  if (mode !== 'dry-run') {
    throw new Error(`Invalid migration mode '${mode}'. Phase 3B requires MIGRATION_MODE=dry-run.`);
  }
  return true;
}

/**
 * Wraps a Prisma client with a safety proxy that intercepts
 * and blocks any mutation method calls.
 */
export function protectPrismaClient(prisma) {
  assertDryRunSafety();

  const writeMethods = new Set([
    'create',
    'createMany',
    'update',
    'updateMany',
    'upsert',
    'delete',
    'deleteMany',
    'executeRaw',
    '$executeRaw',
    '$executeRawUnsafe'
  ]);

  return new Proxy(prisma, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && (prop.startsWith('$execute') || prop.startsWith('execute'))) {
        throw new DryRunViolationError(prop, 'PrismaClient');
      }

      const val = Reflect.get(target, prop, receiver);

      // Intercept model-level operations
      if (typeof val === 'object' && val !== null) {
        return new Proxy(val, {
          get(modelTarget, modelProp, modelReceiver) {
            if (typeof modelProp === 'string' && writeMethods.has(modelProp)) {
              return () => {
                throw new DryRunViolationError(modelProp, String(prop));
              };
            }
            return Reflect.get(modelTarget, modelProp, modelReceiver);
          }
        });
      }

      return val;
    }
  });
}
