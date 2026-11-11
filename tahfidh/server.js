// تشغيل محلي: قاعدة Postgres محلية (في data/) أو DATABASE_URL، مع الواجهة والـ API
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { createHandler } from './lib/app.js';

const root = path.dirname(new URL(import.meta.url).pathname);
const PUBLIC = path.join(root, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

let connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  const { NetlifyDB } = await import('@netlify/database-dev');
  const local = new NetlifyDB({ directory: path.join(root, 'data', 'pg') });
  connectionString = await local.start();
  await local.applyMigrations(path.join(root, 'netlify', 'database', 'migrations'));
}
const handle = createHandler(new pg.Pool({ connectionString }), { adminPassword: process.env.ADMIN_PASSWORD || 'admin123' });

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const r = await handle(new Request(url, { method: req.method, headers: req.headers, body: chunks.length ? Buffer.concat(chunks) : undefined }));
      res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type'), 'Cache-Control': 'no-store', 'Set-Cookie': r.headers.getSetCookie() });
      return res.end(Buffer.from(await r.arrayBuffer()));
    }
    const file = path.join(PUBLIC, path.normalize(url.pathname === '/' ? '/index.html' : url.pathname));
    try {
      if (!file.startsWith(PUBLIC)) throw new Error('outside');
      const content = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(content);
    } catch {
      res.writeHead(404).end('Not found');
    }
  })
  .listen(Number(process.env.PORT) || 3000, () => console.log(`تطبيقة التحفيظ: http://localhost:${process.env.PORT || 3000} (admin / ${process.env.ADMIN_PASSWORD ? '***' : 'admin123'})`));
