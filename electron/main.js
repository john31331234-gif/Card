/* 디지몬 카드 덱 메이커 — PC 프로그램 (Electron 메인 프로세스)
 *
 * - 카드 데이터: digimoncard.io API를 메인 프로세스에서 호출 (브라우저 CORS 제한 없음)
 *   검색 결과는 디스크에 저장해 두었다가 오프라인일 때 사용
 * - 카드 이미지: cardimg://card/<카드번호> 로 요청하면
 *   1) PC에 저장된 이미지가 있으면 그것을 쓰고
 *   2) 없으면 반다이 공식 사이트 또는 digimoncard.io에서 받아 저장한 뒤 보여줌
 *   이미지는 프로그램에 포함되지 않으며, 사용자의 PC에만 저장됨
 */
const { app, BrowserWindow, ipcMain, protocol, net, shell, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

const API_BASE = process.env.DCM_API_BASE || 'https://digimoncard.io/api-public';
const IMAGE_SOURCES = {
  bandai: id => `https://world.digimoncard.com/images/cardlist/card/${id}.png`,
  digimoncardio: id => `https://images.digimoncard.io/images/cards/${id}.jpg`,
};
if (process.env.DCM_IMAGE_BASE) {
  for (const k of Object.keys(IMAGE_SOURCES)) IMAGE_SOURCES[k] = id => `${process.env.DCM_IMAGE_BASE}/${k}/${id}`;
}
const CARD_ID = /^[A-Z0-9]{1,8}-[A-Z0-9_]{1,8}$/i;
const API_ENDPOINTS = new Set(['search']);

protocol.registerSchemesAsPrivileged([
  { scheme: 'cardimg', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const dirs = {};
let settings = { imageSource: 'bandai' };

async function loadSettings() {
  try { settings = { ...settings, ...JSON.parse(await fs.readFile(dirs.settings, 'utf8')) }; } catch { /* 처음 실행 */ }
}
async function saveSettings() {
  await fs.writeFile(dirs.settings, JSON.stringify(settings, null, 2));
}

/* ---------- 카드 이미지 ---------- */
function sourceOrder() {
  const first = IMAGE_SOURCES[settings.imageSource] ? settings.imageSource : 'bandai';
  return [first, ...Object.keys(IMAGE_SOURCES).filter(k => k !== first)];
}

const inflight = new Map();
async function getImageFile(id) {
  // 설정한 출처로 저장된 이미지 → 다른 출처로 저장된 이미지 순으로 찾는다
  for (const src of sourceOrder()) {
    const file = path.join(dirs.images, src, id);
    try { await fs.access(file); return file; } catch { /* 없음 */ }
  }
  if (inflight.has(id)) return inflight.get(id);
  const job = (async () => {
    for (const src of sourceOrder()) {
      try {
        const res = await net.fetch(IMAGE_SOURCES[src](id));
        const type = res.headers.get('content-type') || '';
        if (!res.ok || !type.startsWith('image/')) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        const dir = path.join(dirs.images, src);
        await fs.mkdir(dir, { recursive: true });
        const file = path.join(dir, id);
        await fs.writeFile(file, buf);
        return file;
      } catch { /* 다음 출처 시도 */ }
    }
    return null;
  })();
  inflight.set(id, job);
  try { return await job; } finally { inflight.delete(id); }
}

async function handleCardImage(request) {
  const url = new URL(request.url);
  const id = decodeURIComponent(url.pathname.replace(/^\//, '')).toUpperCase();
  if (url.hostname !== 'card' || !CARD_ID.test(id)) return new Response('bad request', { status: 400 });
  const file = await getImageFile(id);
  if (!file) return new Response('not found', { status: 404 });
  return net.fetch(pathToFileURL(file).toString());
}

/* ---------- 카드 데이터 API ---------- */
async function apiGet(_e, endpoint, params) {
  if (!API_ENDPOINTS.has(endpoint)) throw new Error('허용되지 않은 요청');
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v != null && v !== '') q.set(k, String(v));
  const qs = q.toString();
  const cacheFile = path.join(dirs.api, crypto.createHash('sha1').update(endpoint + '?' + qs).digest('hex') + '.json');
  try {
    const res = await net.fetch(`${API_BASE}/${endpoint}?${qs}`);
    if (res.status === 400 || res.status === 404) return { data: [], offline: false };
    if (!res.ok) throw new Error(`API 오류 (${res.status})`);
    const data = await res.json();
    await fs.writeFile(cacheFile, JSON.stringify(data)).catch(() => {});
    return { data, offline: false };
  } catch (err) {
    // 오프라인: 예전에 같은 검색을 했다면 저장된 결과를 돌려준다
    try { return { data: JSON.parse(await fs.readFile(cacheFile, 'utf8')), offline: true }; }
    catch { throw new Error(`서버에 연결할 수 없고, 저장된 검색 결과도 없습니다 (${err.message})`); }
  }
}

/* ---------- 캐시 정보 ---------- */
async function dirStats(dir) {
  let count = 0, bytes = 0;
  async function walk(d) {
    let entries = [];
    try { entries = await fs.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else { count++; bytes += (await fs.stat(p)).size; }
    }
  }
  await walk(dir);
  return { count, bytes };
}

/* ---------- 창 ---------- */
function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f1420',
    title: '디지몬 카드 덱 메이커',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // 외부 링크는 기본 브라우저로 연다
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) { e.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); }
  });
  win.loadFile(path.join(__dirname, '..', 'index.html'));
  return win;
}

app.whenReady().then(async () => {
  const base = app.getPath('userData');
  dirs.images = path.join(base, 'card-images');
  dirs.api = path.join(base, 'api-cache');
  dirs.settings = path.join(base, 'settings.json');
  await fs.mkdir(dirs.images, { recursive: true });
  await fs.mkdir(dirs.api, { recursive: true });
  await loadSettings();

  protocol.handle('cardimg', handleCardImage);

  ipcMain.handle('api:get', apiGet);
  ipcMain.handle('settings:get', () => ({ ...settings, sources: Object.keys(IMAGE_SOURCES) }));
  ipcMain.handle('settings:set', async (_e, patch) => {
    if (patch && IMAGE_SOURCES[patch.imageSource]) settings.imageSource = patch.imageSource;
    await saveSettings();
    return settings;
  });
  ipcMain.handle('cache:info', async () => ({ images: await dirStats(dirs.images), api: await dirStats(dirs.api), path: base }));
  ipcMain.handle('cache:clear', async () => {
    await fs.rm(dirs.images, { recursive: true, force: true });
    await fs.rm(dirs.api, { recursive: true, force: true });
    await fs.mkdir(dirs.images, { recursive: true });
    await fs.mkdir(dirs.api, { recursive: true });
    return true;
  });
  ipcMain.handle('cache:open', () => shell.openPath(base));

  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
