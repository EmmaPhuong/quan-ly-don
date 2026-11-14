/* Webhook nhận tiền từ SePay -> ghi vào Supabase.
   Đường riêng, không có giao diện. Mọi yêu cầu phải qua: IP của SePay, chữ ký HMAC-SHA256, thời gian trong 5 phút.
   Biến môi trường (đặt trong Vercel > Settings > Environment Variables):
     SEPAY_WEBHOOK_SECRET  khóa bí mật HMAC lấy từ SePay
     SUPABASE_SERVICE_KEY  khóa service_role / secret của Supabase (KHÔNG đặt ở nơi khác)
     SUPABASE_URL          (không bắt buộc) mặc định là dự án hiện tại
     SEPAY_ALLOWED_IPS     (không bắt buộc) danh sách IP, cách nhau dấu phẩy; mặc định là danh sách IP công bố của SePay
     SEPAY_IP_CHECK        đặt "off" để tắt kiểm tra IP nếu cần */
const crypto = require('crypto');

const DEFAULT_IPS = ['172.236.138.20','172.233.83.68','171.244.35.2','151.158.108.68','151.158.109.79','103.255.238.139','45.57.137.67',
  '2400:8905::2000:8cff:fe98:45cd','2600:3c15::2000:8aff:fedd:874b'];
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://agsisjudzprrxrnlrajh.supabase.co').replace(/\/+$/, '');

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > 1024 * 1024) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || String(req.headers['x-real-ip'] || '') || (req.socket && req.socket.remoteAddress) || '';
}
const normIp = ip => ip.toLowerCase().replace(/^::ffff:/, '');
function verifySignature(raw, headers, secret, nowSec) {
  const ts = String(headers['x-sepay-timestamp'] || '');
  const sig = String(headers['x-sepay-signature'] || '');
  if (!/^\d+$/.test(ts) || !sig) return false;
  if (Math.abs(nowSec - parseInt(ts, 10)) > 300) return false;          // chống gửi lại: lệch quá 5 phút thì bỏ
  const h = crypto.createHmac('sha256', secret);
  h.update(ts + '.'); h.update(raw);                                      // chuỗi ký: "{timestamp}.{nội dung gốc}"
  const expected = Buffer.from('sha256=' + h.digest('hex'));
  const got = Buffer.from(sig);
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}
async function callSupabase(payload) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  const headers = { 'Content-Type': 'application/json', apikey: key };
  if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key;     // khóa kiểu cũ (JWT) dùng cả hai header; khóa mới chỉ dùng apikey
  const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/process_sepay_tx', { method: 'POST', headers, body: JSON.stringify({ p: payload }) });
  if (!r.ok) throw new Error('supabase ' + r.status + ' ' + (await r.text()).slice(0, 300));
  return r.json();
}

async function handler(req, res) {
  const send = (code, body) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
  if (req.method !== 'POST') return send(405, { success: false });
  const secret = process.env.SEPAY_WEBHOOK_SECRET;
  if (!secret || !process.env.SUPABASE_SERVICE_KEY) { console.error('sepay: thiếu biến môi trường'); return send(500, { success: false }); }

  if (process.env.SEPAY_IP_CHECK !== 'off') {
    const allowed = (process.env.SEPAY_ALLOWED_IPS ? process.env.SEPAY_ALLOWED_IPS.split(',') : DEFAULT_IPS).map(s => normIp(s.trim())).filter(Boolean);
    const ip = normIp(clientIp(req));
    if (!allowed.includes(ip)) { console.warn('sepay: IP không được phép', ip); return send(403, { success: false }); }
  }

  let raw;
  try { raw = await readRaw(req); } catch (e) { return send(400, { success: false }); }
  if (!verifySignature(raw, req.headers, secret, Math.floor(Date.now() / 1000))) {
    console.warn('sepay: chữ ký hoặc thời gian không hợp lệ');
    return send(401, { success: false });
  }
  let payload;
  try { payload = JSON.parse(raw.toString('utf8')); } catch (e) { return send(400, { success: false }); }
  if (!payload || typeof payload !== 'object' || payload.id == null) return send(400, { success: false });

  try {
    const r = await callSupabase(payload);
    console.log('sepay: id', payload.id, JSON.stringify(r));
    return send(200, { success: true });                                  // đúng định dạng SePay yêu cầu
  } catch (e) {
    console.error('sepay: lỗi ghi dữ liệu', e.message);
    return send(500, { success: false });                                 // lỗi thật thì để SePay gửi lại
  }
}
module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
module.exports._verifySignature = verifySignature;
