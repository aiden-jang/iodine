// Make node-pty's macOS spawn-helper executable (npm sometimes drops the +x bit).
// Written in Node instead of a shell one-liner so it works on Windows (cmd.exe) too.
import { chmodSync, existsSync } from 'fs';

if (process.platform === 'darwin') {
  for (const arch of ['darwin-x64', 'darwin-arm64']) {
    const helper = `node_modules/node-pty/prebuilds/${arch}/spawn-helper`;
    try {
      if (existsSync(helper)) chmodSync(helper, 0o755);
    } catch {
      // Best effort — never fail the install over this.
    }
  }
}
