/**
 * Commands run inside the E2B desktop VM to drive Chrome via CDP.
 * Scripts are base64-decoded on the VM to avoid shell-quoting hell.
 */

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function b64(script: string): string {
  return Buffer.from(script, "utf8").toString("base64");
}

function runNodeScript(script: string, args: string[]): string {
  const encoded = b64(script);
  const argList = args.map(shellSingleQuote).join(" ");
  return [
    `echo ${encoded} | base64 -d > /tmp/sora-cdp.js`,
    `node /tmp/sora-cdp.js ${argList}`,
  ].join(" && ");
}

const ENSURE_CHROME = [
  "mkdir -p /home/user/.sora-chrome",
  "if ! curl -fsS http://127.0.0.1:9222/json/version >/dev/null 2>&1; then",
  "  pkill -f 'remote-debugging-port=9222' >/dev/null 2>&1 || true",
  "  (google-chrome --remote-debugging-port=9222 --user-data-dir=/home/user/.sora-chrome --no-first-run --no-default-browser-check --disable-gpu about:blank >/home/user/.sora-chrome.log 2>&1 &)",
  "  for i in $(seq 1 40); do curl -fsS http://127.0.0.1:9222/json/version >/dev/null 2>&1 && break; sleep 0.35; done",
  "fi",
].join("\n");

/** Ensure Chromium listens on 9222 and navigates to the URL (same desktop stream). */
export function chromeDebugOpenCommand(url: string): string {
  const body = [ENSURE_CHROME, runNodeScript(CDP_NAVIGATE, [url])].join("\n");
  return `bash -lc ${shellSingleQuote(body)}`;
}

export function chromeDebugClickCommand(selector: string): string {
  const body = [ENSURE_CHROME, runNodeScript(CDP_CLICK, [selector])].join("\n");
  return `bash -lc ${shellSingleQuote(body)}`;
}

export function chromeDebugTypeCommand(
  selector: string,
  text: string,
  clear: boolean,
): string {
  const body = [
    ENSURE_CHROME,
    runNodeScript(CDP_TYPE, [selector, text, clear ? "1" : "0"]),
  ].join("\n");
  return `bash -lc ${shellSingleQuote(body)}`;
}

const CDP_NAVIGATE = `
const url = process.argv[1];
const pages = await (await fetch('http://127.0.0.1:9222/json/list')).json();
let page = pages.find(p => p.type === 'page' && p.webSocketDebuggerUrl) || pages.find(p => p.webSocketDebuggerUrl);
if (!page) throw new Error('No Chrome CDP page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('CDP ws failed')); });
let id = 0;
const send = (method, params={}) => new Promise((resolve, reject) => {
  const mid = ++id;
  const onmsg = (ev) => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
    if (msg.id === mid) {
      ws.removeEventListener('message', onmsg);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  };
  ws.addEventListener('message', onmsg);
  ws.send(JSON.stringify({ id: mid, method, params }));
});
await send('Page.enable');
await send('Page.navigate', { url });
await new Promise(r => setTimeout(r, 900));
ws.close();
console.log('ok');
`.trim();

const CDP_CLICK = `
const selector = process.argv[1];
const pages = await (await fetch('http://127.0.0.1:9222/json/list')).json();
let page = pages.find(p => p.type === 'page' && p.webSocketDebuggerUrl) || pages.find(p => p.webSocketDebuggerUrl);
if (!page) throw new Error('No Chrome CDP page — call browser_navigate first');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('CDP ws failed')); });
let id = 0;
const send = (method, params={}) => new Promise((resolve, reject) => {
  const mid = ++id;
  const onmsg = (ev) => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
    if (msg.id === mid) {
      ws.removeEventListener('message', onmsg);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  };
  ws.addEventListener('message', onmsg);
  ws.send(JSON.stringify({ id: mid, method, params }));
});
await send('Runtime.enable');
const expr = '(function(){ const el = document.querySelector(' + JSON.stringify(selector) + '); if (!el) return null; el.scrollIntoView({ block: "center", inline: "center" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 }; })()';
const ev = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
const box = ev && ev.result && ev.result.value;
if (!box) throw new Error('Selector not found: ' + selector);
const x = box.x, y = box.y;
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
ws.close();
console.log(JSON.stringify({ ok: true, x, y, selector }));
`.trim();

const CDP_TYPE = `
const selector = process.argv[1];
const text = process.argv[2] ?? '';
const clear = process.argv[3] === '1';
const pages = await (await fetch('http://127.0.0.1:9222/json/list')).json();
let page = pages.find(p => p.type === 'page' && p.webSocketDebuggerUrl) || pages.find(p => p.webSocketDebuggerUrl);
if (!page) throw new Error('No Chrome CDP page — call browser_navigate first');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('CDP ws failed')); });
let id = 0;
const send = (method, params={}) => new Promise((resolve, reject) => {
  const mid = ++id;
  const onmsg = (ev) => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
    if (msg.id === mid) {
      ws.removeEventListener('message', onmsg);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  };
  ws.addEventListener('message', onmsg);
  ws.send(JSON.stringify({ id: mid, method, params }));
});
await send('Runtime.enable');
const focusExpr = '(function(){ const el = document.querySelector(' + JSON.stringify(selector) + '); if (!el) return false; el.focus(); if (el.click) el.click(); return true; })()';
const focused = await send('Runtime.evaluate', { expression: focusExpr, returnByValue: true });
if (!(focused && focused.result && focused.result.value)) throw new Error('Selector not found: ' + selector);
if (clear) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 2, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
}
await send('Input.insertText', { text });
ws.close();
console.log(JSON.stringify({ ok: true, selector, chars: text.length }));
`.trim();
