import { randomUUID } from 'node:crypto';
import type { Todo } from '@creator-center/shared';
import { isoNow } from '@creator-center/shared';
import type { DB } from '../db.js';

interface TodoRow {
  id: string;
  title: string;
  done: number;
  created_at: string;
  updated_at: string;
}

export function listTodos(db: DB): Todo[] {
  return (db.prepare('SELECT * FROM todos ORDER BY done, created_at DESC').all() as TodoRow[]).map(
    mapTodo,
  );
}

export function createTodo(db: DB, title: string): Todo {
  const trimmed = title.trim();
  if (!trimmed) throw new Error('A to-do needs a title.');
  if (trimmed.length > 300) throw new Error('Keep the to-do under 300 characters.');
  const id = randomUUID();
  const now = isoNow();
  db.prepare('INSERT INTO todos(id, title, done, created_at, updated_at) VALUES (?, ?, 0, ?, ?)').run(
    id,
    trimmed,
    now,
    now,
  );
  return mapTodo(db.prepare('SELECT * FROM todos WHERE id = ?').get(id) as TodoRow);
}

export function updateTodo(db: DB, id: string, patch: { title?: string; done?: boolean }): Todo | null {
  const row = db.prepare('SELECT * FROM todos WHERE id = ?').get(id) as TodoRow | undefined;
  if (!row) return null;
  const title = patch.title !== undefined ? patch.title.trim() : row.title;
  if (!title) throw new Error('A to-do needs a title.');
  if (title.length > 300) throw new Error('Keep the to-do under 300 characters.');
  const done = patch.done !== undefined ? patch.done : row.done === 1;
  db.prepare('UPDATE todos SET title = ?, done = ?, updated_at = ? WHERE id = ?').run(
    title,
    done ? 1 : 0,
    isoNow(),
    id,
  );
  return mapTodo(db.prepare('SELECT * FROM todos WHERE id = ?').get(id) as TodoRow);
}

export function deleteTodo(db: DB, id: string): boolean {
  return db.prepare('DELETE FROM todos WHERE id = ?').run(id).changes > 0;
}

function mapTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    done: row.done === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
