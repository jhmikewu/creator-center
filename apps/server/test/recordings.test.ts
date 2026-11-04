import { createAccount } from '../src/repositories/accounts.js';
import { upsertPost } from '../src/repositories/posts.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  pairRecordings,
  detectClaps,
  validateSections,
  processRecording,
  recording,
  linkRecording,
  saveRecordingEdit,
} from '../src/services/recordings.js';
import { openDatabase } from '../src/db.js';
import { getSettings } from '../src/repositories/settings.js';
import { createMediaProject, addMediaFile, removeMediaFile } from '../src/services/media.js';
import type { RecordingWorkflow } from '@creator-center/shared';

describe('recording decisions', () => {
  it('matches iPad prefix case and whitespace but requires the exact primary name', () => {
    for (const prefix of ['ipad ', 'iPad', 'IPAD   '])
      expect(pairRecordings(['Lesson.mov', `${prefix}Lesson.mov`])).toEqual({
        primary: 'Lesson.mov',
        secondary: `${prefix}Lesson.mov`,
      });
    expect(pairRecordings(['one.mov']).secondary).toBeNull();
    expect(() => pairRecordings(['one.mov', 'ipad two.mov'])).toThrow();
    expect(() => pairRecordings([])).toThrow();
  });
  it('finds isolated transients but not silence or sustained loud audio', () => {
    const pcm = Buffer.alloc(8000 * 2 * 3);
    for (const t of [0.5, 1.5])
      for (let i = t * 8000; i < t * 8000 + 40; i++) pcm.writeInt16LE(25000, i * 2);
    expect(detectClaps(pcm)).toEqual([0.5, 1.5]);
    expect(detectClaps(Buffer.alloc(16000))).toEqual([]);
    for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(25000, i);
    expect(detectClaps(pcm)).toEqual([]);
  });
  it('rejects overlaps, invalid ranges and unavailable secondary time', () => {
    const state = { duration: 10, secondaryMp4: 'ipad', secondaryDuration: 8 } as RecordingWorkflow;
    const s = { start: 0, end: 5, source: 'primary' as const, output: 'Post' };
    expect(() => validateSections([s], state, 0)).not.toThrow();
    expect(() => validateSections([s, s], state, 0)).toThrow();
    expect(() => validateSections([{ ...s, start: -1 }], state, 0)).toThrow();
    expect(() => validateSections([{ ...s, source: 'secondary' }], state, 4)).toThrow();
  });
});

it('converts actual paired MOVs, renders source choices and covers, and preserves state across reopen', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recording-test-'));
  let db = openDatabase(dir);
  try {
    for (const name of ['lesson.mov', 'IPADlesson.mov'])
      execFileSync('ffmpeg', [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        `color=c=${name.startsWith('IPAD') ? 'red' : 'blue'}:s=160x120:r=30:d=1`,
        '-c:v',
        'libx264',
        path.join(dir, name),
      ]);
    const settings = getSettings(db, dir);
    const project = await createMediaProject(db, dir, settings, {
      path: path.join(dir, 'lesson.mov'),
    });
    await addMediaFile(db, dir, settings, project.id, path.join(dir, 'IPADlesson.mov'));
    const preparing = processRecording(db, dir, settings, project.id, 'prepare', {});
    await expect(processRecording(db, dir, settings, project.id, 'prepare', {})).rejects.toThrow(
      'processing',
    );
    const prepared = (await preparing)!;
    expect(prepared.secondaryMp4).toBeTruthy();
    expect(prepared.claps).toEqual([]);
    const rendered = (await processRecording(db, dir, settings, project.id, 'render', {
      sections: [
        { start: 0, end: 0.3, source: 'primary', output: 'Combined' },
        { start: 0.3, end: 0.6, source: 'secondary', output: 'Combined' },
        { start: 0.6, end: 0.8, source: 'drop', output: 'Combined' },
        { start: 0.8, end: 1, source: 'primary', output: 'Separate' },
      ],
    }))!;
    expect(rendered.outputs).toHaveLength(2);
    const combined = db
      .prepare('SELECT relative_path FROM media_files WHERE id = ?')
      .get(rendered.outputs[0]!.fileId) as { relative_path: string };
    const videoPath = path.join(dir, 'media', combined.relative_path);
    const pixel = (time: string) =>
      execFileSync('ffmpeg', [
        '-v',
        'error',
        '-ss',
        time,
        '-i',
        videoPath,
        '-vf',
        'crop=2:2:960:540',
        '-frames:v',
        '1',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        'pipe:1',
      ]);
    expect(pixel('0.1')[2]).toBeGreaterThan(200);
    expect(pixel('0.4')[0]).toBeGreaterThan(200);
    const account = createAccount(db, { platform: 'youtube', displayName: 'Main' });
    const postInput = {
      accountId: account.id,
      platform: 'youtube' as const,
      remoteId: 'published',
      title: 'Lesson',
      url: '',
      format: 'video',
      status: 'published' as const,
      publishedAt: null,
      scheduledAt: null,
      metrics: {},
      collectedAt: new Date().toISOString(),
    };
    const post = upsertPost(db, postInput);
    const outputId = rendered.outputs[0]!.fileId;
    expect(linkRecording(db, project.id, outputId, post.id, true)?.outputs[0]?.postIds).toEqual([
      post.id,
    ]);
    expect(linkRecording(db, project.id, outputId, post.id, true)?.outputs[0]?.postIds).toEqual([
      post.id,
    ]);
    upsertPost(db, { ...postInput, title: 'Updated from collector' });
    expect(recording(db, project.id)?.outputs[0]?.postIds).toEqual([post.id]);
    expect(linkRecording(db, project.id, outputId, post.id, false)?.outputs[0]?.postIds).toEqual(
      [],
    );
    linkRecording(db, project.id, outputId, post.id, true);
    db.prepare('DELETE FROM posts WHERE id = ?').run(post.id);
    expect(recording(db, project.id)?.outputs[0]?.postIds).toEqual([]);
    saveRecordingEdit(db, project.id, { sections: prepared.sections, offset: 0.1 });
    expect(() => removeMediaFile(db, dir, settings, prepared.primary)).toThrow(
      'preserved together',
    );
    expect(() =>
      linkRecording(db, project.id, rendered.outputs[0]!.fileId, 'missing', true),
    ).toThrow('Post not found');
    db.close();
    db = openDatabase(dir);
    expect(recording(db, project.id)?.outputs).toHaveLength(2);
    expect(recording(db, project.id)?.offset).toBe(0.1);
    const files = db.prepare('SELECT * FROM media_files WHERE mime_type = ?').all('image/jpeg');
    expect(files).toHaveLength(2);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}, 120000);

it('prepares a single MOV with audio and cleans up failed conversions for retry', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'single-recording-test-'));
  const db = openDatabase(dir);
  try {
    const source = path.join(dir, 'single.mov');
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:s=160x120:r=30:d=2',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=400:duration=2',
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      source,
    ]);
    const settings = getSettings(db, dir);
    const project = await createMediaProject(db, dir, settings, { path: source });
    const state = (await processRecording(db, dir, settings, project.id, 'prepare', {}))!;
    expect(state.secondaryMp4).toBeNull();
    expect(state.sections).toHaveLength(1);
    await expect(processRecording(db, dir, settings, project.id, 'prepare', {})).rejects.toThrow(
      'already prepared',
    );
    fs.writeFileSync(path.join(dir, 'ipad single.mov'), 'broken secondary');
    const partial = await createMediaProject(db, dir, settings, { path: source });
    await addMediaFile(db, dir, settings, partial.id, path.join(dir, 'ipad single.mov'));
    await expect(processRecording(db, dir, settings, partial.id, 'prepare', {})).rejects.toThrow(
      'ffprobe failed',
    );
    expect(
      db.prepare('SELECT id FROM media_files WHERE project_id = ?').all(partial.id),
    ).toHaveLength(2);
    expect(recording(db, partial.id)).toBeNull();
    fs.writeFileSync(path.join(dir, 'broken.mov'), 'not a video');
    const broken = await createMediaProject(db, dir, settings, {
      path: path.join(dir, 'broken.mov'),
    });
    for (let retry = 0; retry < 2; retry++)
      await expect(processRecording(db, dir, settings, broken.id, 'prepare', {})).rejects.toThrow(
        'ffprobe failed',
      );
    expect(recording(db, broken.id)).toBeNull();
    expect(
      db.prepare('SELECT id FROM media_files WHERE project_id = ?').all(broken.id),
    ).toHaveLength(1);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}, 120000);
