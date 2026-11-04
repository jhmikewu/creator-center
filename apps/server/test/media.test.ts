import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/api.js';
import { openDatabase } from '../src/db.js';
import { getSettings } from '../src/repositories/settings.js';
import { SyncService } from '../src/services/sync.js';

const openWorkspaces: { close: () => void }[] = [];

function workspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creator-center-media-'));
  const db = openDatabase(dir);
  const sync = new SyncService(db, () => getSettings(db, dir));
  const app = createApp({ db, dataDir: dir, version: 'test', sync });
  openWorkspaces.push({
    close: () => {
      sync.stopAuto();
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  });
  return { dir, db, app };
}

afterEach(() => {
  while (openWorkspaces.length) openWorkspaces.pop()?.close();
});

const binaryParser = (
  response: NodeJS.ReadableStream,
  callback: (error: Error | null, body?: Buffer) => void,
) => {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
};

function writeSource(dir: string, name: string, content = '0123456789'): string {
  const source = path.join(dir, name);
  fs.writeFileSync(source, content);
  return source;
}

describe('local media storage', () => {
  it('stores an imported file in its project folder and serves byte ranges', async () => {
    const { dir, app } = workspace();
    const source = writeSource(dir, 'lesson.mp4');
    const created = await request(app)
      .post('/api/media/projects')
      .send({ title: 'Rotational dynamics', path: source })
      .expect(201);

    expect(created.body.title).toBe('Rotational dynamics');
    expect(created.body.files).toHaveLength(1);
    expect(created.body.bytes).toBe(10);
    const file = created.body.files[0];
    expect(file.name).toBe('lesson.mp4');
    expect(file.mimeType).toBe('video/mp4');
    expect(file.relativePath).toBe(`projects/${created.body.id}/lesson.mp4`);
    expect(fs.readFileSync(path.join(dir, 'media', file.relativePath))).toEqual(
      Buffer.from('0123456789'),
    );

    const full = await request(app)
      .get(`/api/media/files/${file.id}/content`)
      .parse(binaryParser)
      .expect(200);
    expect(full.headers['accept-ranges']).toBe('bytes');
    expect(full.headers['content-type']).toContain('video/mp4');
    expect(full.headers['content-length']).toBe('10');
    expect(full.body.toString()).toBe('0123456789');

    const partial = await request(app)
      .get(`/api/media/files/${file.id}/content`)
      .set('Range', 'bytes=2-5')
      .parse(binaryParser)
      .expect(206);
    expect(partial.headers['content-range']).toBe('bytes 2-5/10');
    expect(partial.headers['content-length']).toBe('4');
    expect(partial.body.toString()).toBe('2345');

    const suffix = await request(app)
      .get(`/api/media/files/${file.id}/content`)
      .set('Range', 'bytes=-3')
      .parse(binaryParser)
      .expect(206);
    expect(suffix.headers['content-range']).toBe('bytes 7-9/10');
    expect(suffix.body.toString()).toBe('789');

    await request(app)
      .get(`/api/media/files/${file.id}/content`)
      .set('Range', 'bytes=20-30')
      .expect(416);
  });

  it('lists projects, removes files and removes the project folder', async () => {
    const { dir, app } = workspace();
    const source = writeSource(dir, 'clip.mp4', 'abcdef');
    const created = await request(app)
      .post('/api/media/projects')
      .send({ path: source })
      .expect(201);
    expect(created.body.title).toBe('clip');
    const file = created.body.files[0];

    const library = await request(app).get('/api/media').expect(200);
    expect(library.body.projects).toHaveLength(1);
    expect(library.body.fileCount).toBe(1);
    expect(library.body.bytes).toBe(6);
    expect(library.body.storage.root).toBe(path.join(dir, 'media'));
    expect(typeof library.body.storage.freeBytes).toBe('number');

    await request(app).delete(`/api/media/files/${file.id}`).expect(204);
    expect(fs.existsSync(path.join(dir, 'media', file.relativePath))).toBe(false);
    const emptied = await request(app).get('/api/media').expect(200);
    expect(emptied.body.projects[0].files).toEqual([]);
    expect(emptied.body.fileCount).toBe(0);
    expect(fs.existsSync(path.join(dir, 'media', 'projects', created.body.id))).toBe(false);

    await request(app).delete(`/api/media/projects/${created.body.id}`).expect(204);
    const empty = await request(app).get('/api/media').expect(200);
    expect(empty.body.projects).toEqual([]);
  });

  it('keeps same-named imports distinct inside one project', async () => {
    const { dir, app } = workspace();
    const source = writeSource(dir, 'clip.mp4');
    const created = await request(app)
      .post('/api/media/projects')
      .send({ title: 'Clip', path: source })
      .expect(201);
    const added = await request(app)
      .post(`/api/media/projects/${created.body.id}/files`)
      .send({ path: source })
      .expect(201);
    expect(created.body.files[0].name).toBe('clip.mp4');
    expect(added.body.name).toBe('clip (2).mp4');
    const stored = path.join(dir, 'media', added.body.relativePath);
    expect(fs.existsSync(stored)).toBe(true);

    await request(app)
      .post(`/api/media/projects/${created.body.id}/files`)
      .send({ path: stored })
      .expect(409);
  });

  it('rejects missing, unsupported and invalid media files', async () => {
    const { dir, app } = workspace();
    const unsupported = writeSource(dir, 'notes.exe');
    await request(app)
      .post('/api/media/projects')
      .send({ title: 'Nope', path: unsupported })
      .expect(400);
    await request(app)
      .post('/api/media/projects')
      .send({ title: 'Missing', path: path.join(dir, 'missing.mp4') })
      .expect(400);
    await request(app).post('/api/media/projects').send({ title: '' }).expect(400);
    await request(app).delete('/api/media/projects/unknown').expect(404);
    await request(app).delete('/api/media/files/unknown').expect(404);
  });

  it('adopts a custom root before media exists and blocks changing it afterwards', async () => {
    const { dir, app } = workspace();
    const defaults = await request(app).get('/api/bootstrap').expect(200);
    expect(defaults.body.settings.mediaRoot).toBe(path.join(dir, 'media'));

    const custom = path.join(dir, 'central-media');
    const adopted = await request(app).patch('/api/settings').send({ mediaRoot: custom }).expect(200);
    expect(adopted.body.mediaRoot).toBe(custom);

    const notADirectory = writeSource(dir, 'not-a-folder');
    await request(app)
      .patch('/api/settings')
      .send({ mediaRoot: notADirectory })
      .expect(400);

    const source = writeSource(dir, 'lesson.mov', 'quicktime');
    const created = await request(app)
      .post('/api/media/projects')
      .send({ title: 'Lesson', path: source })
      .expect(201);
    const file = created.body.files[0];
    expect(fs.readFileSync(path.join(custom, file.relativePath), 'utf8')).toBe('quicktime');
    const library = await request(app).get('/api/media').expect(200);
    expect(library.body.storage.root).toBe(custom);

    await request(app)
      .patch('/api/settings')
      .send({ mediaRoot: path.join(dir, 'other-media') })
      .expect(409);
    await request(app).patch('/api/settings').send({ mediaRoot: null }).expect(409);
  });
});
