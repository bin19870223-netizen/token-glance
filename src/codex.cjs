const { spawn } = require('node:child_process');
const { readdirSync, existsSync } = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

function findCodex() {
  if (process.env.AGENT_HUD_CODEX && existsSync(process.env.AGENT_HUD_CODEX)) return process.env.AGENT_HUD_CODEX;
  const base = path.join(process.env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'bin');
  try {
    const candidates = readdirSync(base, { withFileTypes: true }).filter(d => d.isDirectory())
      .map(d => path.join(base, d.name, 'codex.exe')).filter(existsSync);
    candidates.sort((a,b) => require('node:fs').statSync(b).mtimeMs - require('node:fs').statSync(a).mtimeMs);
    if (candidates.length) return candidates[0];
  } catch {}
  return 'codex.exe';
}

class CodexClient {
  constructor() { this.pending = new Map(); this.sequence = 0; this.child = null; this.ready = false; }
  request(method, params = {}) {
    const allowed = ['initialize', 'account/read', 'account/rateLimits/read', 'account/usage/read', 'thread/list'];
    if (!allowed.includes(method)) return Promise.reject(new Error('Read-only method required'));
    if (!this.child?.stdin?.writable) return Promise.reject(new Error('Codex unavailable'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Codex request timed out')); }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
  }
  async connect() {
    if (this.ready) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.start().finally(() => { this.connecting = null; });
    return this.connecting;
  }
  async start() {
    this.stop();
    const child = spawn(findCodex(), ['app-server', '--listen', 'stdio://'], {
      windowsHide: true, stdio: ['pipe','pipe','ignore'], cwd: path.resolve(__dirname, '..')
    });
    this.child = child;
    const fail = () => {
      if (this.child !== child) return;
      this.ready = false;
      for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('Codex disconnected')); }
      this.pending.clear();
    };
    child.once('error', fail);
    child.once('exit', fail);
    child.stdin.on('error',fail);
    readline.createInterface({ input: child.stdout }).on('line', line => {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id); clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error('Codex RPC ' + message.error.code));
      else entry.resolve(message.result);
    });
    await this.request('initialize', { clientInfo: { name:'agent_hud_windows', title:'Token Glance Windows', version:'0.1.0' }, capabilities:{ experimentalApi: true } });
    child.stdin.write(JSON.stringify({ method:'initialized', params:{} }) + '\n');
    this.ready = true;
  }
  async read() {
    await this.connect();
    const limits = await this.request('account/rateLimits/read');
    const extras = await Promise.allSettled([
      this.request('account/read', { refreshToken: false }),
      this.request('account/usage/read', {}),
      this.request('thread/list', { limit:6, sortKey:'updated_at', sortDirection:'desc', archived:false })
    ]);
    return { limits, account:extras[0].value, usage:extras[1].value, threads:extras[2].value };
  }
  stop() {
    this.ready = false;
    for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(new Error('Codex stopped')); }
    this.pending.clear();
    const child = this.child; this.child = null; child?.kill();
  }
}
module.exports = { CodexClient, findCodex };
