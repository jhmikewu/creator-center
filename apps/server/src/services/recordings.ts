import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type {
  AppSettings,
  RecordingWorkflow,
  RecordingSection,
  RecordingProgress,
} from '@creator-center/shared';
import type { DB } from '../db.js';
import * as repo from '../repositories/media.js';
import { mediaStorage } from './media.js';
import { MediaError } from './media-storage.js';

const busy = new Set<string>();
const progress = new Map<string, RecordingProgress>();
export function recordingProgress(db: DB, id: string): RecordingProgress | null {
  if (!repo.getMediaProject(db, id)) throw new MediaError(404, 'Project not found.');
  return progress.get(id) ?? null;
}
/** ffmpeg reports microseconds even for the legacy out_time_ms key. */
export function progressSeconds(line: string): number | null {
  const match = /^out_time_(?:us|ms)=(-?\d+)$/.exec(line);
  return match ? Math.max(0, Number(match[1]) / 1_000_000) : null;
}
export function canCopyVideo(stream: { codec_name?: string; pix_fmt?: string }): boolean {
  return stream.codec_name === 'h264' && stream.pix_fmt === 'yuv420p';
}
export function assertRecordingIdle(id: string) {
  if (busy.has(id)) throw new MediaError(409, 'This recording is processing.');
}
export function recording(db: DB, id: string): RecordingWorkflow | null {
  if (!repo.getMediaProject(db, id)) throw new MediaError(404, 'Project not found.');
  const row = db.prepare('SELECT state FROM media_workflows WHERE project_id = ?').get(id) as
    { state: string } | undefined;
  if (!row) return null;
  const state = JSON.parse(row.state) as RecordingWorkflow;
  for (const output of state.outputs)
    output.postIds = (
      db.prepare('SELECT post_id FROM media_video_posts WHERE file_id = ?').all(output.fileId) as {
        post_id: string;
      }[]
    ).map((r) => r.post_id);
  return state;
}
function save(db: DB, id: string, state: RecordingWorkflow) {
  db.prepare(
    'INSERT INTO media_workflows VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET state = excluded.state',
  ).run(id, JSON.stringify(state));
  repo.touchMediaProject(db, id);
}
export function pairRecordings(names: string[]): { primary: string; secondary: string | null } {
  if (names.length === 1) return { primary: names[0]!, secondary: null };
  if (names.length === 2) {
    for (const primary of names) {
      const secondary = names.find((n) => n !== primary && n.replace(/^ipad\s*/i, '') === primary);
      if (secondary) return { primary, secondary };
    }
  }
  throw new MediaError(400, 'Use one MOV, or a MOV plus “ipad <same name>.MOV”.');
}
async function run(
  command: string,
  args: string[],
  onProgress?: (seconds: number) => void,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe', 'pipe'] });
    let pending = '';
    child.stdio[3]?.on('data', (data: Buffer) => {
      pending += data.toString();
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        const seconds = progressSeconds(line.trim());
        if (seconds !== null) onProgress?.(seconds);
      }
    });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let error = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 6 * 60 * 60 * 1000);
    child.stdout!.on('data', (data: Buffer) => {
      bytes += data.length;
      if (bytes > 256 * 1024 * 1024) child.kill();
      else chunks.push(data);
    });
    child.stderr!.on('data', (data) => {
      error = (error + String(data)).slice(-4000);
    });
    child.on('error', () => {
      clearTimeout(timer);
      reject(new MediaError(500, `Install ${command} and make it available on PATH.`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(chunks));
      else
        reject(new MediaError(500, `${command} failed: ${error || 'processing limit exceeded'}`));
    });
  });
}
const ffmpeg = (args: string[], onProgress?: (seconds: number) => void) =>
  run(
    'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-progress', 'pipe:3', ...args],
    onProgress,
  );
async function probe(file: string) {
  const data = JSON.parse(
    (
      await run('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file])
    ).toString(),
  );
  const duration = Number(data.format.duration);
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    !data.streams.some((s: { codec_type: string }) => s.codec_type === 'video')
  )
    throw new MediaError(400, 'Recording has no valid video duration.');
  return {
    duration,
    copyVideo: canCopyVideo(
      data.streams.find((s: { codec_type: string }) => s.codec_type === 'video'),
    ),
    copyAudio:
      data.streams.find((s: { codec_type: string }) => s.codec_type === 'audio')?.codec_name ===
      'aac',
    audio: data.streams.some((s: { codec_type: string }) => s.codec_type === 'audio'),
  };
}
/** Transient candidates: 10ms peak blocks, sharp rise over recent background, 400ms refractory period. */
export function detectClaps(pcm: Buffer, rate = 8000): number[] {
  const peaks: number[] = [];
  const block = Math.round(rate / 100);
  for (let i = 0; i < pcm.length / 2; i += block) {
    let peak = 0;
    for (let j = i; j < Math.min(i + block, pcm.length / 2); j++)
      peak = Math.max(peak, Math.abs(pcm.readInt16LE(j * 2)) / 32768);
    peaks.push(peak);
  }
  const result: number[] = [];
  for (let i = 10; i < peaks.length - 10; i++) {
    const baseline = peaks.slice(i - 10, i).reduce((a, b) => a + b, 0) / 10;
    const after = peaks.slice(i + 5, i + 10).reduce((a, b) => a + b, 0) / 5;
    if (
      peaks[i]! > 0.18 &&
      peaks[i]! > Math.max(baseline, after, 0.015) * 3 &&
      i / 100 - (result.at(-1) ?? -1) > 0.4
    )
      result.push(i / 100);
  }
  return result;
}
export function validateSections(
  sections: RecordingSection[],
  state: RecordingWorkflow,
  offset: number,
) {
  if (
    !Array.isArray(sections) ||
    !sections.length ||
    sections.length > 500 ||
    !Number.isFinite(offset)
  )
    throw new MediaError(400, 'Invalid sections or offset.');
  let end = 0;
  for (const s of sections) {
    if (
      !s ||
      !Number.isFinite(s.start) ||
      !Number.isFinite(s.end) ||
      s.start < end ||
      s.end <= s.start ||
      s.end > state.duration + 0.001 ||
      !['primary', 'secondary', 'drop'].includes(s.source) ||
      typeof s.output !== 'string' ||
      !s.output.trim() ||
      s.output.length > 80
    )
      throw new MediaError(
        400,
        'Sections must be ordered, non-overlapping ranges within the recording, with output names.',
      );
    if (
      s.source === 'secondary' &&
      (!state.secondaryMp4 ||
        s.start + offset < 0 ||
        s.end + offset > (state.secondaryDuration ?? 0) + 0.001)
    )
      throw new MediaError(400, 'The iPad source does not cover this section at that offset.');
    end = s.end;
  }
}
export function saveRecordingEdit(
  db: DB,
  id: string,
  input: { sections: RecordingSection[]; offset: number },
) {
  assertRecordingIdle(id);
  const state = recording(db, id);
  if (!state) throw new MediaError(409, 'Prepare the recording first.');
  validateSections(input.sections, state, input.offset);
  state.sections = input.sections;
  state.offset = input.offset;
  save(db, id, state);
  return state;
}
export async function processRecording(
  db: DB,
  dataDir: string,
  settings: AppSettings,
  id: string,
  action: 'prepare' | 'render',
  input: { sections?: RecordingSection[]; offset?: number },
) {
  assertRecordingIdle(id);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'creator-recording-'));
  busy.add(id);
  progress.set(id, { stage: 'Reading recording', percent: null });
  const trackedFfmpeg = async (stage: string, duration: number, args: string[]) => {
    progress.set(id, { stage, percent: 0 });
    await ffmpeg(args, (seconds) => {
      const previous = progress.get(id)?.percent ?? 0;
      progress.set(id, {
        stage,
        percent: Math.max(previous, Math.min(99, Math.round((seconds / duration) * 100))),
      });
    });
    progress.set(id, { stage, percent: 100 });
  };
  const storage = mediaStorage(dataDir, settings);
  const added: string[] = [];
  const source = (fileId: string) => {
    const f = repo.getMediaFile(db, fileId);
    if (!f || f.projectId !== id) throw new MediaError(404, 'Recording source missing.');
    storage.stat(f.relativePath);
    return path.join(storage.root, f.relativePath);
  };
  const store = async (file: string) => {
    progress.set(id, { stage: 'Saving file', percent: null });
    const imported = await storage.importFile(id, file);
    try {
      const result = repo.insertMediaFile(db, { projectId: id, ...imported });
      added.push(result.id);
      return result.id;
    } catch (error) {
      storage.removeFile(imported.relativePath);
      throw error;
    }
  };
  try {
    let state = recording(db, id);
    if (action === 'prepare') {
      if (state) throw new MediaError(409, 'This recording is already prepared.');
      const files = repo.getMediaProject(db, id)!.files.filter((f) => /\.mov$/i.test(f.name));
      const pair = pairRecordings(files.map((f) => f.name));
      const primary = files.find((f) => f.name === pair.primary)!;
      const secondary = files.find((f) => f.name === pair.secondary);
      const convert = async (fileId: string, name: string) => {
        const file = source(fileId);
        const info = await probe(file);
        const dest = path.join(temp, `${name}.mp4`);
        await trackedFfmpeg(
          `${info.copyVideo ? 'Repackaging' : 'Converting'} ${name === 'ipad' ? 'iPad' : 'primary'} to MP4`,
          info.duration,
          [
            '-i',
            file,
            ...(!info.audio ? ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'] : []),
            '-map',
            '0:v:0',
            '-map',
            info.audio ? '0:a:0' : '1:a:0',
            '-t',
            String(info.duration),
            ...(info.copyVideo
              ? ['-c:v', 'copy']
              : [
                  '-vf',
                  'scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1',
                  '-c:v',
                  'libx264',
                  '-preset',
                  'veryfast',
                  '-crf',
                  '20',
                  '-pix_fmt',
                  'yuv420p',
                ]),
            ...(info.copyAudio ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-ar', '48000', '-ac', '2']),
            '-movflags',
            '+faststart',
            dest,
          ],
        );
        return { id: await store(dest), ...info, dest };
      };
      const p = await convert(primary.id, 'primary');
      const s = secondary ? await convert(secondary.id, 'ipad') : null;
      const clapTimes = async (video: typeof p, label: string) => {
        progress.set(id, { stage: `Detecting claps · ${label}`, percent: video.audio ? 0 : null });
        return video.audio
          ? detectClaps(
              await ffmpeg(
                ['-i', video.dest, '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1'],
                (seconds) =>
                  progress.set(id, {
                    stage: `Detecting claps · ${label}`,
                    percent: Math.min(99, Math.round((seconds / video.duration) * 100)),
                  }),
              ),
            ).filter((t) => t > 0.1 && t < video.duration - 0.1)
          : [];
      };
      const primaryClaps = await clapTimes(p, 'primary');
      const secondaryClaps = s ? await clapTimes(s, 'iPad') : [];
      const claps = (p.audio ? primaryClaps : secondaryClaps).filter((t) => t < p.duration - 0.1);
      const bounds = [0, ...claps, p.duration];
      state = {
        primary: primary.id,
        secondary: secondary?.id ?? null,
        primaryMp4: p.id,
        secondaryMp4: s?.id ?? null,
        duration: p.duration,
        secondaryDuration: s?.duration ?? null,
        offset: 0,
        claps,
        secondaryClaps,
        sections: bounds.slice(0, -1).map((start, i) => ({
          start,
          end: bounds[i + 1]!,
          source: 'primary',
          output: 'Video 1',
        })),
        outputs: [],
      };
    } else {
      if (!state) throw new MediaError(409, 'Prepare the recording first.');
      const sections = input.sections!;
      const offset = input.offset ?? 0;
      validateSections(sections, state, offset);
      const groups = [
        ...new Set(sections.filter((s) => s.source !== 'drop').map((s) => s.output.trim())),
      ];
      if (!groups.length) throw new MediaError(400, 'Keep at least one section.');
      for (const [index, title] of groups.entries()) {
        const clips: string[] = [];
        for (const section of sections.filter(
          (s) => s.source !== 'drop' && s.output.trim() === title,
        )) {
          const clip = path.join(temp, `clip-${index}-${clips.length}.mkv`);
          await trackedFfmpeg(
            `Rendering ${title} · section ${clips.length + 1}`,
            section.end - section.start,
            [
              '-ss',
              String(section.start + (section.source === 'secondary' ? offset : 0)),
              '-i',
              source(section.source === 'secondary' ? state.secondaryMp4! : state.primaryMp4),
              '-t',
              String(section.end - section.start),
              '-vf',
              'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30',
              '-c:v',
              'libx264',
              '-preset',
              'fast',
              '-crf',
              '20',
              '-pix_fmt',
              'yuv420p',
              '-c:a',
              'pcm_s16le',
              '-ar',
              '48000',
              '-ac',
              '2',
              clip,
            ],
          );
          clips.push(clip);
        }
        const list = path.join(temp, `list-${index}.txt`);
        fs.writeFileSync(list, clips.map((c) => `file '${path.basename(c)}'`).join('\n'));
        const video = path.join(temp, `video-${index + 1}.mp4`);
        const cover = path.join(temp, `cover-${index + 1}.jpg`);
        await trackedFfmpeg(
          `Joining ${title}`,
          sections
            .filter((s) => s.source !== 'drop' && s.output.trim() === title)
            .reduce((total, s) => total + s.end - s.start, 0),
          [
            '-f',
            'concat',
            '-safe',
            '0',
            '-i',
            list,
            '-c:v',
            'copy',
            '-c:a',
            'aac',
            '-movflags',
            '+faststart',
            video,
          ],
        );
        progress.set(id, { stage: `Cover · ${title}`, percent: null });
        await ffmpeg(['-i', video, '-frames:v', '1', '-q:v', '2', cover]);
        state.outputs.push({
          fileId: await store(video),
          coverId: await store(cover),
          title,
          postIds: [],
        });
      }
      state.sections = sections;
      state.offset = offset;
    }
    save(db, id, state);
    return recording(db, id);
  } catch (error) {
    for (const fileId of added) {
      const file = repo.getMediaFile(db, fileId);
      if (file) {
        storage.removeFile(file.relativePath);
        repo.deleteMediaFileRow(db, fileId);
      }
    }
    throw error;
  } finally {
    progress.delete(id);
    busy.delete(id);
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
export function linkRecording(db: DB, id: string, fileId: string, postId: string, linked: boolean) {
  assertRecordingIdle(id);
  const state = recording(db, id);
  if (!state?.outputs.some((o) => o.fileId === fileId))
    throw new MediaError(404, 'Rendered video not found.');
  if (linked) {
    if (!db.prepare('SELECT id FROM posts WHERE id = ?').get(postId))
      throw new MediaError(404, 'Post not found.');
    db.prepare('INSERT OR IGNORE INTO media_video_posts VALUES (?, ?)').run(fileId, postId);
  } else
    db.prepare('DELETE FROM media_video_posts WHERE file_id = ? AND post_id = ?').run(
      fileId,
      postId,
    );
  return recording(db, id);
}
