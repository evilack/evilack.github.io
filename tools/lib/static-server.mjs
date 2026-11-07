import http from 'node:http';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';

/**
 * 미리보기와 브라우저 검증이 함께 쓰는 정적 서버입니다.
 * root/host/port는 호출자가 설정에서 전달하며, port=0이면 OS가 빈 포트를 고릅니다.
 * no-cache는 저장을 허용하되 재검증하게 하므로 실제 뒤로/앞으로 캐시도 검사할 수 있습니다.
 */
export function createStaticServer({ root, host, port }) {
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const server = http.createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      let filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      const relative = path.relative(root, filename);
      if (relative.startsWith('..') || path.isAbsolute(relative)) { response.writeHead(403).end(); return; }
      if ((await stat(filename)).isDirectory()) filename = path.join(filename, 'index.html');
      const bytes = await readFile(filename);
      response.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream',
        'Content-Length': bytes.length, 'Cache-Control': 'no-cache' });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch { response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found'); }
  });
  return {
    async start() {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
      return `http://${host}:${server.address().port}/`;
    },
    async close() { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); },
  };
}
