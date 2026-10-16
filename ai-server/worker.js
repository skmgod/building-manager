// 건물관리 중간 서버 (Cloudflare Worker)
// - /mcp/<비밀키>      : 제미나이·그록·클로드가 연결하는 주소 (민원을 보관함에 넣기)
// - /inbox/<비밀키>    : 건물관리 앱이 보관함을 가져가는 주소
// 보관함에 들어간 민원은 앱이 가져가면 서버에서 지워집니다.

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version',
};
const PROTOCOL_VERSION = '2025-06-18';
const MAX_ITEMS = 200;

const TOOLS = [
  {
    name: 'add_complaint',
    description: '건물 민원(고장 신고)을 건물관리 보관함에 넣습니다. 사용자가 앱에서 "AI 보관함 가져오기"를 누르면 앱 청구 목록으로 옮겨집니다. 건물이름과 고장 내용은 꼭 필요합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        building: { type: 'string', description: '건물이름. 예: 행복빌라' },
        unit: { type: 'string', description: '호수. 예: 301호' },
        phone: { type: 'string', description: '전화번호. 예: 010-1234-5678' },
        issue: { type: 'string', description: '고장 신고 내용. 예: 화장실 변기 물이 안 내려가요' },
        date: { type: 'string', description: '접수 날짜 YYYY-MM-DD. 없으면 오늘' },
        memo: { type: 'string', description: '메모 (시간 등 자유롭게). 예: 오후 3시 이후 방문 가능' },
      },
      required: ['building', 'issue'],
    },
  },
  {
    name: 'list_pending',
    description: '아직 앱으로 가져가지 않은 보관함 민원 목록을 보여줍니다.',
    inputSchema: { type: 'object', properties: {} },
  },
];

const clip = (v, n) => String(v ?? '').trim().slice(0, n);

// 오늘 날짜 (한국 시간 기준)
function todayKST() {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function cleanComplaint(a) {
  const building = clip(a.building, 60);
  const issue = clip(a.issue, 300);
  if (!building) throw new Error('건물이름이 필요해요');
  if (!issue) throw new Error('고장 신고 내용이 필요해요');
  let date = clip(a.date, 10) || todayKST();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('날짜는 YYYY-MM-DD 형식이어야 해요. 예: 2026-10-20');
  return {
    building,
    unit: clip(a.unit, 40),
    phone: clip(a.phone, 30),
    issue,
    memo: clip(a.memo, 300),
    date,
    createdAt: new Date().toISOString(),
  };
}

async function listInbox(env) {
  const { keys } = await env.KV.list({ prefix: 'c:', limit: MAX_ITEMS });
  const items = [];
  for (const k of keys) {
    const v = await env.KV.get(k.name, 'json');
    if (v) items.push({ id: k.name.slice(2), ...v });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

const summary = c => `${c.date} · ${[c.building, c.unit].filter(Boolean).join(' ')} · ${c.issue}`;

async function callTool(name, args, env) {
  if (name === 'add_complaint') {
    const c = cleanComplaint(args || {});
    const id = crypto.randomUUID();
    await env.KV.put('c:' + id, JSON.stringify(c));
    return { text: `보관함에 넣었어요: ${summary(c)}\n앱에서 "AI 보관함 가져오기"를 누르면 건물관리 민원으로 들어가요.` };
  }
  if (name === 'list_pending') {
    const items = await listInbox(env);
    if (!items.length) return { text: '보관함이 비어 있어요. 아직 가져가지 않은 민원이 없어요.' };
    return { text: `아직 가져가지 않은 민원 ${items.length}건:\n` + items.map(summary).join('\n') };
  }
  throw new Error('알 수 없는 도구예요: ' + name);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: JSON_HEADERS });
}

async function handleMcp(req, env) {
  let msg;
  try { msg = await req.json(); } catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400); }
  const isNotification = msg.id === undefined;
  const ok = result => json({ jsonrpc: '2.0', id: msg.id, result });

  if (isNotification) return new Response(null, { status: 202, headers: JSON_HEADERS });

  switch (msg.method) {
    case 'initialize':
      return ok({
        protocolVersion: msg.params?.protocolVersion || PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'building-manager', version: '1.0.0' },
        instructions: '건물 민원을 건물관리 보관함에 넣는 서버예요. 건물이름과 고장 내용은 꼭 맞춰 주세요.',
      });
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: TOOLS });
    case 'tools/call':
      try {
        const out = await callTool(msg.params?.name, msg.params?.arguments, env);
        return ok({ content: [{ type: 'text', text: out.text }] });
      } catch (e) {
        return ok({ content: [{ type: 'text', text: '오류: ' + e.message }], isError: true });
      }
    default:
      return json({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Method not found' } });
  }
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: JSON_HEADERS });

    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const [area, key, action] = parts;

    if (!env.SECRET || key !== env.SECRET) return json({ error: '주소가 맞지 않아요' }, 401);

    // 제미나이·그록·클로드 연결 주소
    if (area === 'mcp') {
      if (req.method !== 'POST') return json({ error: 'POST만 받아요' }, 405);
      return handleMcp(req, env);
    }

    // 건물관리 앱이 쓰는 주소
    if (area === 'inbox') {
      if (req.method === 'GET' && !action) return json({ items: await listInbox(env) });
      if (req.method === 'POST' && action === 'ack') {
        const body = await req.json().catch(() => ({}));
        const ids = Array.isArray(body.ids) ? body.ids.slice(0, MAX_ITEMS) : [];
        for (const x of ids) await env.KV.delete('c:' + String(x));
        return json({ removed: ids.length });
      }
    }

    return json({ error: '없는 주소예요' }, 404);
  },
};
