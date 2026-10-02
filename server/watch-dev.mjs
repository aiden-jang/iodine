/**
 * Custom dev watcher for the Iodine server.
 *
 * Behaves like `tsx watch src/index.ts` but defers restarts while an agent
 * SSE turn is in progress. Without this, a write_file tool call triggers a
 * tsx restart mid-turn, killing the SSE stream before the agent can make
 * further edits in the same turn.
 *
 * Mechanism: the /agent/chat route writes AGENT_LOCK_FILE (tmpdir) when a
 * turn starts and deletes it when it ends. This watcher polls that file
 * before restarting; if it exists the restart is held until the turn
 * completes or the LOCK_TIMEOUT elapses.
 */

import { spawn } from 'child_process';
import { watch, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(__dirname, 'src');
const LOCK_FILE = join(tmpdir(), 'iodine-agent.lock');
const LOCK_TIMEOUT_MS = 120_000; // 2 min safety ceiling

let proc = null;

// With `shell: true`, proc is a wrapper shell. On Windows, proc.kill() only kills
// that cmd.exe and leaves tsx running (holding the port), so kill the whole tree.
function killTree(child, signal = 'SIGTERM') {
  if (!child) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill(signal);
  }
}
let pendingRestart = false;
let changeTimer = null;
let pollTimer = null;
let pollStart = 0;

function startServer() {
  proc = spawn('tsx', ['src/index.ts'], {
    stdio: 'inherit',
    shell: true,
    cwd: __dirname,
    env: { ...process.env },
  });
  proc.on('exit', () => {
    proc = null;
    if (pendingRestart) {
      pendingRestart = false;
      startServer();
    }
  });
}

function doRestart() {
  clearTimeout(pollTimer);
  const elapsed = Date.now() - pollStart;
  if (existsSync(LOCK_FILE) && elapsed < LOCK_TIMEOUT_MS) {
    process.stdout.write('\r[watch] agent turn in progress — holding restart...');
    pollTimer = setTimeout(doRestart, 1000);
    return;
  }
  if (elapsed >= LOCK_TIMEOUT_MS) {
    console.log('\n[watch] lock timeout — restarting anyway');
  } else {
    process.stdout.write('\n');
  }
  pendingRestart = true;
  if (proc) {
    killTree(proc, 'SIGTERM');
    // Force-kill if the process doesn't exit cleanly within 5 s.
    setTimeout(() => { if (proc) killTree(proc, 'SIGKILL'); }, 5000);
  } else {
    startServer();
  }
}

function scheduleRestart() {
  clearTimeout(changeTimer);
  clearTimeout(pollTimer);
  changeTimer = setTimeout(() => {
    pollStart = Date.now();
    doRestart();
  }, 300); // 300 ms debounce to coalesce rapid saves
}

// Forward signals so concurrently/npm can tear down the whole tree cleanly.
process.on('SIGTERM', () => { killTree(proc); process.exit(0); });
process.on('SIGINT',  () => { killTree(proc); process.exit(0); });

startServer();

watch(SRC_DIR, { recursive: true }, (_, filename) => {
  if (filename?.endsWith('.ts')) scheduleRestart();
});

console.log('[watch] iodine server — watching', SRC_DIR);
