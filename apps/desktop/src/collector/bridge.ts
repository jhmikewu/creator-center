import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { CollectorRequest, CollectorResponse } from '@creator-center/shared';
import { captureDouyin } from './douyin.js';

export interface CollectorBridge {
  url: string;
  close: () => void;
}

/**
 * Local-only bridge the sidecar calls when a live account is synced. The
 * sidecar never receives cookies; it only gets the mapped capture.
 */
export async function startCollectorBridge(): Promise<CollectorBridge> {
  const server = http.createServer((request, response) => {
    void handle(request, response);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => server.close(),
  };
}

async function handle(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
  if (request.method === 'GET' && request.url === '/health') {
    respond(response, 200, { ok: true });
    return;
  }
  if (request.method !== 'POST' || request.url !== '/collect') {
    respond(response, 404, { ok: false, detail: 'Not found.' });
    return;
  }
  let body: CollectorRequest;
  try {
    body = JSON.parse(await readBody(request)) as CollectorRequest;
  } catch {
    respond(response, 400, { ok: false, detail: 'Invalid collector request.' });
    return;
  }
  if (!body || typeof body.accountId !== 'string' || !body.accountId) {
    respond(response, 400, { ok: false, detail: 'No account selected.' });
    return;
  }
  if (body.platform !== 'douyin') {
    respond(response, 200, {
      ok: false,
      detail: 'This platform has no live collector in this build yet. Sign in is available; collection is not.',
    });
    return;
  }
  const result: CollectorResponse = await captureDouyin(body.accountId, body.studioUrl ?? null);
  respond(response, 200, result);
}

function respond(response: http.ServerResponse, status: number, payload: unknown): void {
  const text = JSON.stringify(payload);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  });
  response.end(text);
}

function readBody(request: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 32_768) {
        reject(new Error('Collector request is too large.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}
