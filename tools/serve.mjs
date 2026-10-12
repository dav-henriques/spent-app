/**
 * Servidor local para desenvolvimento, sem dependências.
 *
 * Uso:
 *   node tools/serve.mjs                    → http://localhost:8080/gastos/
 *   node tools/serve.mjs --base /           → http://localhost:8080/
 *   node tools/serve.mjs --port 3000
 *
 * Por padrão o app é servido dentro de /gastos/, simulando um repositório
 * publicado no GitHub Pages (https://usuario.github.io/gastos/). Assim dá
 * para conferir que nenhum caminho depende da raiz do domínio.
 * "localhost" é tratado como contexto seguro: o service worker funciona.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
};
const PORT = Number(option('port', process.env.PORT || 8080));
let BASE = option('base', '/gastos/');
if (!BASE.startsWith('/')) BASE = `/${BASE}`;
if (!BASE.endsWith('/')) BASE = `${BASE}/`;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const log = (status) => console.log(`${status} ${req.method} ${url.pathname}`);

  if (BASE !== '/' && (url.pathname === '/' || url.pathname === BASE.slice(0, -1))) {
    res.writeHead(302, { Location: BASE });
    res.end();
    log(302);
    return;
  }
  if (!url.pathname.startsWith(BASE)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Não encontrado (fora do caminho base)');
    log(404);
    return;
  }

  let relative = decodeURIComponent(url.pathname.slice(BASE.length));
  if (relative === '' || relative.endsWith('/')) relative += 'index.html';
  const file = normalize(join(ROOT, relative));
  if (!file.startsWith(ROOT + sep) || relative.split('/').some((part) => part.startsWith('.'))) {
    res.writeHead(403);
    res.end();
    log(403);
    return;
  }

  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
    log(200);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Não encontrado');
    log(404);
  }
});

server.listen(PORT, () => {
  console.log(`Gastos disponível em http://localhost:${PORT}${BASE}`);
});
