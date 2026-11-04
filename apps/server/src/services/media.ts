import path from 'node:path';
import type { AppSettings, MediaFile, MediaLibrary, MediaProject } from '@creator-center/shared';
import type { DB } from '../db.js';
import * as repo from '../repositories/media.js';
import {
  LocalMediaStorage,
  MediaError,
  configuredMediaRoot,
  type MediaStorageDriver,
} from './media-storage.js';

/** The single place the rest of the server gets a configured storage driver. */
export function mediaStorage(dataDir: string, settings: AppSettings): MediaStorageDriver {
  return new LocalMediaStorage(configuredMediaRoot(dataDir, settings));
}

export function mediaLibrary(db: DB, dataDir: string, settings: AppSettings): MediaLibrary {
  const projects = repo.listMediaProjects(db);
  const totals = repo.mediaTotals(db);
  return {
    storage: mediaStorage(dataDir, settings).info(),
    projects,
    ...totals,
  };
}

export async function createMediaProject(
  db: DB,
  dataDir: string,
  settings: AppSettings,
  input: { title?: unknown; path?: unknown },
): Promise<MediaProject> {
  const sourcePath = typeof input.path === 'string' ? input.path.trim() : '';
  const title = normalizeTitle(input.title, sourcePath);
  const project = repo.createMediaProjectRow(db, title);
  if (!sourcePath) return project;
  try {
    await addMediaFile(db, dataDir, settings, project.id, sourcePath);
  } catch (error) {
    repo.deleteMediaProjectRow(db, project.id);
    try {
      mediaStorage(dataDir, settings).removeProject(project.id);
    } catch {
      // The import may have failed before any folder was created.
    }
    throw error;
  }
  return repo.getMediaProject(db, project.id) as MediaProject;
}

export async function addMediaFile(
  db: DB,
  dataDir: string,
  settings: AppSettings,
  projectId: string,
  sourcePath: string,
): Promise<MediaFile> {
  if (!repo.getMediaProject(db, projectId)) {
    throw new MediaError(404, 'That media project no longer exists.');
  }
  const storage = mediaStorage(dataDir, settings);
  const imported = await storage.importFile(projectId, sourcePath);
  try {
    return repo.insertMediaFile(db, { projectId, ...imported });
  } catch (error) {
    try {
      storage.removeFile(imported.relativePath);
    } catch {
      // Leave the orphan for a later cleanup attempt rather than hiding the failure.
    }
    throw error;
  }
}

export function removeMediaFile(
  db: DB,
  dataDir: string,
  settings: AppSettings,
  fileId: string,
): void {
  const file = repo.getMediaFile(db, fileId);
  if (!file) throw new MediaError(404, 'That media file no longer exists.');
  const storage = mediaStorage(dataDir, settings);
  requireStorage(storage);
  storage.removeFile(file.relativePath);
  repo.deleteMediaFileRow(db, fileId);
  repo.touchMediaProject(db, file.projectId);
}

export function removeMediaProject(
  db: DB,
  dataDir: string,
  settings: AppSettings,
  projectId: string,
): void {
  const project = repo.getMediaProject(db, projectId);
  if (!project) throw new MediaError(404, 'That media project no longer exists.');
  const storage = mediaStorage(dataDir, settings);
  requireStorage(storage);
  storage.removeProject(project.id);
  repo.deleteMediaProjectRow(db, project.id);
}

export function mediaFileForServing(
  db: DB,
  dataDir: string,
  settings: AppSettings,
  fileId: string,
): { file: MediaFile; storage: MediaStorageDriver; size: number } {
  const file = repo.getMediaFile(db, fileId);
  if (!file) throw new MediaError(404, 'That media file no longer exists.');
  const storage = mediaStorage(dataDir, settings);
  return { file, storage, size: storage.stat(file.relativePath).size };
}

export function mediaProjectCount(db: DB): number {
  return repo.mediaProjectCount(db);
}

function normalizeTitle(title: unknown, sourcePath: string): string {
  const provided = typeof title === 'string' ? title.trim() : '';
  const fallback = sourcePath ? path.basename(sourcePath, path.extname(sourcePath)) : '';
  const value = (provided || fallback).trim();
  if (!value) throw new MediaError(400, 'Give the media project a title.');
  if (value.length > 160) throw new MediaError(400, 'Keep the media project title under 160 characters.');
  return value;
}

function requireStorage(storage: MediaStorageDriver): void {
  const info = storage.info();
  if (info.error) throw new MediaError(400, `Media storage is not available: ${info.error}`);
}
