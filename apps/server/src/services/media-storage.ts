import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import type { AppSettings, MediaStorageInfo, MediaStorageKind } from '@creator-center/shared';

/**
 * Media storage seam.
 *
 * The local driver in this file is the only implementation for now. A future
 * home file service (the unRAID share) can implement the same methods with
 * HTTP/NFS behind it without changing the API, repository or UI: project
 * folders and relative paths remain the stable contract, and the driver owns
 * how bytes are copied, streamed and removed.
 */

export class MediaError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'MediaError';
  }
}

/** Supported media extensions; the storage folder is not a general file dump. */
export const MEDIA_MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.srt': 'text/plain',
  '.vtt': 'text/vtt',
};

export interface StoredMediaFile {
  name: string;
  relativePath: string;
  bytes: number;
  mimeType: string;
}

/**
 * The storage driver contract. A remote file service can implement this
 * interface without changing the repository, API or UI; relative project paths
 * are the stable handle.
 */
export interface MediaStorageDriver {
  readonly kind: MediaStorageKind;
  readonly root: string;
  info(): MediaStorageInfo;
  importFile(projectId: string, sourcePath: string): Promise<StoredMediaFile>;
  stat(relativePath: string): { size: number };
  open(relativePath: string, range?: { start: number; end: number }): Readable;
  removeFile(relativePath: string): void;
  removeProject(projectId: string): void;
}

const PROJECT_ID = /^[a-zA-Z0-9_-]+$/;

export function expandHome(input: string): string {
  const value = input.trim();
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return value;
}

export function defaultMediaRoot(dataDir: string): string {
  return path.join(dataDir, 'media');
}

export function configuredMediaRoot(
  dataDir: string,
  settings: Pick<AppSettings, 'mediaRoot'>,
): string {
  const configured = settings.mediaRoot?.trim();
  return configured ? path.resolve(expandHome(configured)) : defaultMediaRoot(dataDir);
}

/** Resolve a configured root without creating it. */
export function resolveMediaRootPath(input: string, dataDir: string): string {
  return path.resolve(expandHome(input) || defaultMediaRoot(dataDir));
}

/** Create and validate a configured root before it is saved. */
export function prepareMediaRoot(input: string, dataDir: string): string {
  const resolved = resolveMediaRootPath(input, dataDir);
  try {
    fs.mkdirSync(resolved, { recursive: true });
    if (!fs.statSync(resolved).isDirectory()) throw new Error('Not a directory.');
    fs.accessSync(resolved, fs.constants.W_OK);
  } catch {
    throw new MediaError(400, `The media storage folder cannot be used: ${resolved}`);
  }
  return resolved;
}

export class LocalMediaStorage implements MediaStorageDriver {
  readonly kind = 'local' as const;
  readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  info(): MediaStorageInfo {
    try {
      fs.mkdirSync(this.root, { recursive: true });
      fs.accessSync(this.root, fs.constants.W_OK);
      const stats = fs.statfsSync(this.root);
      return {
        kind: 'local',
        root: this.root,
        totalBytes: finiteBytes(Number(stats.blocks) * Number(stats.bsize)),
        freeBytes: finiteBytes(Number(stats.bavail) * Number(stats.bsize)),
        error: null,
      };
    } catch (error) {
      return {
        kind: 'local',
        root: this.root,
        totalBytes: null,
        freeBytes: null,
        error: error instanceof Error ? error.message : 'The media storage folder is not available.',
      };
    }
  }

  async importFile(projectId: string, sourcePath: string): Promise<StoredMediaFile> {
    if (!PROJECT_ID.test(projectId)) throw new MediaError(400, 'That media project id is not valid.');
    const source = path.resolve(expandHome(sourcePath));
    if (!sourcePath.trim()) throw new MediaError(400, 'Choose a file to store.');
    let sourceStat: fs.Stats;
    try {
      sourceStat = fs.statSync(source);
    } catch {
      throw new MediaError(400, `The file does not exist: ${source}`);
    }
    if (!sourceStat.isFile()) throw new MediaError(400, `That path is not a file: ${source}`);
    const extension = path.extname(source).toLowerCase();
    const mimeType = MEDIA_MIME_TYPES[extension];
    if (!mimeType) {
      throw new MediaError(
        400,
        `Only ${Object.keys(MEDIA_MIME_TYPES).join(', ')} files can be stored locally.`,
      );
    }
    if (isInside(this.root, source)) {
      throw new MediaError(409, 'That file is already inside the media storage folder.');
    }
    const storage = this.info();
    if (storage.error) {
      throw new MediaError(400, `Media storage is not available: ${storage.error}`);
    }
    if (storage.freeBytes !== null && sourceStat.size + 64 * 1024 * 1024 > storage.freeBytes) {
      throw new MediaError(
        507,
        `Not enough free space in ${this.root}. Free up space or choose another storage root.`,
      );
    }

    const projectDir = path.join(this.root, 'projects', projectId);
    fs.mkdirSync(projectDir, { recursive: true });
    const { name, destination } = reserveFileName(projectDir, fileNameFor(source));
    const temporary = path.join(projectDir, `.${name}.${randomUUID()}.part`);
    try {
      await fs.promises.copyFile(source, temporary);
      if (process.platform === 'win32') fs.rmSync(destination, { force: true });
      fs.renameSync(temporary, destination);
    } catch (error) {
      fs.rmSync(temporary, { force: true });
      fs.rmSync(destination, { force: true });
      throw new MediaError(
        500,
        `The file could not be copied into local storage: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
    return {
      name,
      relativePath: path.posix.join('projects', projectId, name),
      bytes: fs.statSync(destination).size,
      mimeType,
    };
  }

  stat(relativePath: string): { size: number } {
    let stats: fs.Stats;
    try {
      stats = fs.statSync(this.resolve(relativePath));
    } catch {
      throw new MediaError(404, 'The media file is missing from local storage.');
    }
    if (!stats.isFile()) throw new MediaError(404, 'The media file is missing from local storage.');
    return { size: stats.size };
  }

  open(
    relativePath: string,
    range?: { start: number; end: number },
  ): Readable {
    return fs.createReadStream(this.resolve(relativePath), range);
  }

  removeFile(relativePath: string): void {
    const absolute = this.resolve(relativePath);
    try {
      fs.rmSync(absolute, { force: true });
    } catch (error) {
      throw new MediaError(
        500,
        `The stored file could not be removed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
    pruneProjectDir(path.dirname(absolute), path.join(this.root, 'projects'));
  }

  removeProject(projectId: string): void {
    if (!PROJECT_ID.test(projectId)) throw new MediaError(400, 'That media project id is not valid.');
    try {
      fs.rmSync(path.join(this.root, 'projects', projectId), { recursive: true, force: true });
    } catch (error) {
      throw new MediaError(
        500,
        `The project folder could not be removed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  private resolve(relativePath: string): string {
    const normalized = relativePath.replaceAll('\\', '/');
    if (
      !normalized ||
      normalized.startsWith('/') ||
      normalized.split('/').some((part) => part === '..' || part === '')
    ) {
      throw new MediaError(400, 'The stored media path is not valid.');
    }
    const absolute = path.resolve(this.root, normalized);
    if (absolute !== this.root && !absolute.startsWith(this.root + path.sep)) {
      throw new MediaError(400, 'The stored media path is not valid.');
    }
    return absolute;
  }
}

function finiteBytes(value: number): number | null {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function fileNameFor(sourcePath: string): string {
  const extension = path.extname(sourcePath).toLowerCase();
  const stem = path
    .basename(sourcePath, path.extname(sourcePath))
    .replace(/[\u0000-\u001f\u007f\\/]/g, '-')
    .trim()
    .slice(0, 140);
  return `${stem || 'media'}${extension}`;
}

function reserveFileName(
  directory: string,
  preferred: string,
): { name: string; destination: string } {
  const extension = path.extname(preferred);
  const stem = preferred.slice(0, -extension.length) || 'media';
  for (let index = 1; index < 1000; index += 1) {
    const candidate = index === 1 ? preferred : `${stem} (${index})${extension}`;
    const destination = path.join(directory, candidate);
    try {
      const handle = fs.openSync(destination, 'wx');
      fs.closeSync(handle);
      return { name: candidate, destination };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue;
      throw new MediaError(
        500,
        `A file name could not be reserved in local storage: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }
  throw new MediaError(500, `No free file name was available for ${preferred}.`);
}

function pruneProjectDir(directory: string, projectsRoot: string): void {
  if (path.dirname(directory) !== projectsRoot) return;
  try {
    if (fs.readdirSync(directory).length === 0) fs.rmdirSync(directory);
  } catch {
    // A concurrent import or removal owns the folder; leave it alone.
  }
}
