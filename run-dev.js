import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('\x1b[36m%s\x1b[0m', '🚀 Starting Campus Auction monorepo (Server + Client)...');

const serverProc = spawn(process.execPath, ['--max-old-space-size=4096', 'src/index.js'], {
  cwd: path.join(__dirname, 'server'),
  stdio: 'inherit',
});

const viteBin = path.join(__dirname, 'client', 'node_modules', 'vite', 'bin', 'vite.js');
const clientProc = spawn(process.execPath, [viteBin], {
  cwd: path.join(__dirname, 'client'),
  stdio: 'inherit',
});

const cleanup = () => {
  console.log('\nStopping servers...');
  serverProc.kill();
  clientProc.kill();
  process.exit();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
