import path from 'node:path';
import os from 'node:os';
import { openDatabase } from '../db.js';
import { getSettings } from '../repositories/settings.js';
import { listAccounts } from '../repositories/accounts.js';
import { isDemoWorkspace, removeDemoWorkspace, seedDemoWorkspace } from './seed.js';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

const dataDir = path.resolve(arg('data-dir') ?? path.join(os.homedir(), '.creator-center'));
const reset = process.argv.includes('--reset');
const db = openDatabase(dataDir);
try {
  const settings = getSettings(db, dataDir);
  if (reset && isDemoWorkspace(db)) removeDemoWorkspace(db);
  if (listAccounts(db).length) {
    console.error(`Workspace ${dataDir} already has accounts. Use an empty data directory.`);
    process.exitCode = 1;
  } else {
    seedDemoWorkspace(db, settings);
    console.log(`Demo workspace seeded in ${dataDir}`);
    console.log(`Accounts: ${listAccounts(db).map((account) => account.displayName).join(', ')}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  db.close();
}
