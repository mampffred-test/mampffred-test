import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import {
  extname,
  isAbsolute,
  join,
  normalize,
  relative as relativePath,
} from 'node:path';
import process from 'node:process';

const root = normalize(join(process.cwd(), 'dist', 'client'));
const port = Number(process.env.PORT ?? 4173);
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.rsc': 'text/x-component',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

async function serve(request, response) {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url ?? '/', 'http://local').pathname,
    );
    const requestedPath =
      pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const target = normalize(join(root, requestedPath));
    const containment = relativePath(root, target);
    if (
      containment === '..' ||
      containment.startsWith(
        `..${process.platform === 'win32' ? '\\' : '/'}`,
      ) ||
      isAbsolute(containment)
    ) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const file = await stat(target);
    if (!file.isFile()) throw new Error('Not a file');
    response.writeHead(200, {
      'Content-Type': types[extname(target)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    const stream = createReadStream(target);
    stream.on('error', () => response.destroy());
    stream.pipe(response);
  } catch (error) {
    const status = error instanceof URIError ? 400 : 404;
    if (!response.headersSent)
      response
        .writeHead(status)
        .end(status === 400 ? 'Bad request' : 'Not found');
    else response.destroy();
  }
}

createServer((request, response) => {
  void serve(request, response);
}).listen(port, '127.0.0.1', () => {
  console.log(`Static preview: http://127.0.0.1:${port}`);
});
