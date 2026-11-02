// The harness environment sets ELECTRON_RUN_AS_NODE=1 for background commands.
// Electron must start as a GUI app here, so the variable is removed for the child.
delete process.env.ELECTRON_RUN_AS_NODE;
const { spawn } = require('node:child_process');
const electron = require('electron');
const child = spawn(electron, ['.'], { stdio: 'inherit', env: process.env });
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
