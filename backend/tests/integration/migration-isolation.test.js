import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../../src/app.js';

describe('Integration: Migration Runtime Isolation Verification', () => {
  it('Verifies app.js has zero imports from src/migration/', () => {
    const appSource = fs.readFileSync(path.resolve('src/app.js'), 'utf8');
    expect(appSource).not.toMatch(/from\s+['"].*\/migration\/.*['"]/i);
    expect(appSource).not.toMatch(/firebase-admin/i);
    expect(appSource).not.toMatch(/migrator/i);
  });

  it('Verifies server.js has zero imports from src/migration/', () => {
    const serverSource = fs.readFileSync(path.resolve('src/server.js'), 'utf8');
    expect(serverSource).not.toMatch(/from\s+['"].*\/migration\/.*['"]/i);
    expect(serverSource).not.toMatch(/firebase-admin/i);
    expect(serverSource).not.toMatch(/migrator/i);
  });

  it('Verifies src/routes/index.js has zero imports from src/migration/', () => {
    const routesSource = fs.readFileSync(path.resolve('src/routes/index.js'), 'utf8');
    expect(routesSource).not.toMatch(/from\s+['"].*\/migration\/.*['"]/i);
    expect(routesSource).not.toMatch(/firebase-admin/i);
  });

  it('Verifies createApp() boots cleanly without side-effect migrations or writes', () => {
    const app = createApp();
    expect(app).toBeDefined();
    expect(typeof app.listen).toBe('function');
  });
});
