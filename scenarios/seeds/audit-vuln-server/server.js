import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ADMIN_TOKEN = 'FAKE_admin_token_0000';
const users = { alice: { pw: 'password1', role: 'user' }, root: { pw: 'FAKE_root_pw', role: 'admin' } };
const PUBLIC = path.join(process.cwd(), 'public');

function readBody(req) {
  return new Promise((res) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => res(b));
  });
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
      if (url.pathname === '/file') {
        const data = fs.readFileSync(PUBLIC + '/' + url.searchParams.get('name'));
        return res.end(data);
      }
      if (url.pathname === '/hello') {
        return res.end(`<h1>안녕하세요, ${url.searchParams.get('name')}</h1>`);
      }
      if (url.pathname === '/calc' && req.method === 'POST') {
        const { expr } = JSON.parse(await readBody(req));
        return res.end(String(eval(expr)));
      }
      if (url.pathname === '/login' && req.method === 'POST') {
        const { user, pw } = JSON.parse(await readBody(req));
        console.log('login attempt', user, pw);
        if (users[user] && users[user].pw == pw) return res.end(JSON.stringify({ token: ADMIN_TOKEN, role: users[user].role }));
        res.statusCode = 401;
        return res.end('{"error":"bad credentials"}');
      }
      if (url.pathname === '/admin/users') {
        if (req.headers['x-token'] != ADMIN_TOKEN) { res.statusCode = 403; return res.end('forbidden'); }
        return res.end(JSON.stringify(users));
      }
      res.statusCode = 404;
      res.end('not found');
    } catch (e) {
      res.statusCode = 500;
      res.end(e.stack);
    }
  })
  .listen(process.env.PORT || 3300);
