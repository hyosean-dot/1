import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const port = Number(process.env.PORT || 3000);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const windows = new Map();
function limited(ip) {
  const now = Date.now(), item = windows.get(ip);
  if (!item || now - item.start > 60_000) { windows.set(ip, { start: now, count: 1 }); return false; }
  return ++item.count > 20;
}
function reply(res, code, body) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self)');
  if (req.url === '/api/chat' && req.method === 'POST') {
    if (!apiKey) return reply(res, 503, { error: '서버 관리자가 Gemini API 키를 설정해야 해요.' });
    if (limited(req.socket.remoteAddress || 'unknown')) return reply(res, 429, { error: '잠시 쉬었다가 다시 시도해 주세요.' });
    try {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 12_000) return reply(res, 413, { error: '메시지가 너무 길어요.' }); }
      const { text, language } = JSON.parse(body || '{}');
      if (typeof text !== 'string' || !text.trim() || text.length > 1000) return reply(res, 400, { error: '짧은 메시지를 입력해 주세요.' });
      const allowed = ['English', 'Korean', 'Japanese', 'Spanish', 'French'];
      const target = allowed.includes(language) ? language : 'English';
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: `You are a warm, safe language tutor for children. Teach ${target} with short age-appropriate replies. Be encouraging and gently correct mistakes. Never request personal information. If the learner shares identifying details, do not repeat them; remind them not to share private information.` }] }, contents: [{ role: 'user', parts: [{ text: text.trim() }] }], generationConfig: { maxOutputTokens: 180, temperature: 0.6 } })
      });
      const result = await response.json();
      if (!response.ok) { console.error('Gemini API status:', response.status); return reply(res, 502, { error: 'AI 응답을 가져오지 못했어요. 모델과 API 설정을 확인해 주세요.' }); }
      const answer = result.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
      if (!answer) return reply(res, 502, { error: 'AI가 답변을 만들지 못했어요. 다시 말해 주세요.' });
      return reply(res, 200, { answer });
    } catch (error) { console.error('Chat request failed:', error.message); return reply(res, 400, { error: '요청을 처리하지 못했어요.' }); }
  }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = normalize(join(root, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  try { const data = await readFile(file); res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(req.method === 'HEAD' ? undefined : data); }
  catch { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); }
});
server.listen(port, () => console.log(`Listening on port ${port}`));
