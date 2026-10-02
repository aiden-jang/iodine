#!/usr/bin/env node
'use strict';

const path = require('path');
const { spawn, exec } = require('child_process');

const port = Number(process.env.PORT) || 3001;
const url  = `http://localhost:${port}`;

const server = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'dist', 'index.js')], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production', PORT: String(port) },
});

server.on('error', (err) => {
  console.error('Iodine: failed to start —', err.message);
  process.exit(1);
});

// Open the browser once the server has had a moment to bind.
setTimeout(() => {
  const cmd = process.platform === 'darwin' ? `open "${url}"`
    : process.platform === 'win32'          ? `start "${url}"`
    :                                         `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) console.log(`Iodine is running. Open ${url} in your browser.`);
  });
}, 1500);

const shutdown = () => { server.kill(); process.exit(0); };
process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);
