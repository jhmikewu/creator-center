/**
 * Start the API against the demo workspace, seeding it when the data directory
 * is empty. Used by the screenshot and evaluation workflow.
 */
import path from 'node:path';
import os from 'node:os';
import { openDatabase } from '../db.js';
import { getSettings } from '../repositories/settings.js';
import { listAccounts } from '../repositories/accounts.js';
import { isDemoWorkspace, removeDemoWorkspace, seedDemoWorkspace } from './seed.js';
import { startLocalServer } from '../index.js';

const dataDir = path.resolve(
  process.env.CREATOR_CENTER_DATA_DIR ?? path.join(os.homedir(), '.creator-center-demo'),
);
const db = openDatabase(dataDir);
if (process.argv.includes('--reset') || listAccounts(db).length === 0) {
  if (isDemoWorkspace(db)) removeDemoWorkspace(db);
  if (listAccounts(db).length === 0) seedDemoWorkspace(db, getSettings(db, dataDir));
}
db.close();

const server = await startLocalServer({ dataDir, port: 4317 });
console.log(`Creator Center API on ${server.url}`);
