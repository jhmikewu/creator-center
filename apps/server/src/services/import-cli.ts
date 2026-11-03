import path from 'node:path';
import os from 'node:os';
import { openDatabase } from '../db.js';
import { importOldWorkspace, previewOldWorkspace } from './import-old.js';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

const source = arg('source');
if (!source) {
  console.error('Usage: npm run import:old -- --source <old.sqlite3> [--data-dir <dir>] [--dry-run]');
  process.exit(2);
}
const dataDir = path.resolve(
  arg('data-dir') ?? process.env.CREATOR_CENTER_DATA_DIR ?? path.join(os.homedir(), '.creator-center'),
);
const db = openDatabase(dataDir);
try {
  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify(previewOldWorkspace(db, dataDir, source), null, 2));
  } else {
    console.log(JSON.stringify(importOldWorkspace(db, dataDir, source), null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  db.close();
}
