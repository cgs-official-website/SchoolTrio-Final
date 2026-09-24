import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';

console.log('\x1b[36m%s\x1b[0m', '==================================================');
console.log('\x1b[36m%s\x1b[0m', '   Starting SchoolTrio (Redis + Backend + Frontend)');
console.log('\x1b[36m%s\x1b[0m', '==================================================');

const redisExe = path.join(__dirname, 'redis', 'redis-server.exe');
let redisProcess = null;
if (fs.existsSync(redisExe)) {
  redisProcess = spawn(redisExe, [], {
    cwd: path.join(__dirname, 'redis'),
    stdio: 'ignore'
  });
  console.log('\x1b[32m%s\x1b[0m', '[REDIS] Local Redis service started on port 6379');
}

const backend = spawn(npmCmd, ['run', 'dev'], {
  cwd: path.join(__dirname, 'backend'),
  stdio: 'inherit',
  shell: true
});

const frontend = spawn(npmCmd, ['run', 'dev'], {
  cwd: path.join(__dirname, 'frontend'),
  stdio: 'inherit',
  shell: true
});

const shutdown = () => {
  console.log('\n\x1b[33m%s\x1b[0m', 'Shutting down servers...');
  if (isWindows) {
    if (backend.pid) spawn('taskkill', ['/pid', backend.pid.toString(), '/f', '/t']);
    if (frontend.pid) spawn('taskkill', ['/pid', frontend.pid.toString(), '/f', '/t']);
    if (redisProcess && redisProcess.pid) spawn('taskkill', ['/pid', redisProcess.pid.toString(), '/f', '/t']);
  } else {
    backend.kill();
    frontend.kill();
    if (redisProcess) redisProcess.kill();
  }
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
