import fs from 'node:fs';
import {loadDotsKey,transcribeDots} from './dots-client.mjs';
import { captureFrames } from './browser-frames.mjs';
import { acquireVideo, resolveVideo } from './video-download.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { chromium } from 'playwright';
import { searchCards } from './search-cards.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const state = path.resolve(process.env.XHS_STATE_DIR || path.join(process.env.LOCALAPPDATA || os.homedir(), 'XhsResearch'));
const chrome = process.env.XHS_CHROME_PATH || [
  path.join(process.env.PROGRAMFILES || 'C:/Program Files','Google/Chrome/Application/chrome.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)','Google/Chrome/Application/chrome.exe'),
  path.join(process.env.LOCALAPPDATA || os.homedir(),'Google/Chrome/Application/chrome.exe')
].find(p => fs.existsSync(p));
async function main() {
const [command, value, ...timestamps] = process.argv.slice(2);
if (!['login','status','search','read','video','frames','dots'].includes(command)) { console.error('Allowed: login | status | search KEYWORD | read FULL_NOTE_URL | video FULL_NOTE_URL | frames FULL_NOTE_URL [SECONDS...] | dots FULL_NOTE_URL --allow-cloud'); process.exit(2); }
if(command==='dots' && !timestamps.includes('--allow-cloud'))throw new Error('Dots sends the selected media URL to the official cloud API. Add --allow-cloud only after accepting this and checking current pricing.');
const dotsKey=command==='dots'?loadDotsKey(state):null;
let target = 'https://www.xiaohongshu.com/explore';
if (command === 'search') {
  if (!value || value.length > 120) throw new Error('Keyword must be 1-120 characters');
  target = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(value)}`;
}
if (['read','video','frames','dots'].includes(command)) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.hostname !== 'www.xiaohongshu.com' || u.port || u.username || u.password || !/^\/(explore|discovery\/item)\/[a-f0-9]{24}$/.test(u.pathname)) throw new Error('Use a full HTTPS Xiaohongshu note URL from search results');
  const cachedPath = path.join(state, 'note-links.json');
  const cached = fs.existsSync(cachedPath) ? JSON.parse(fs.readFileSync(cachedPath,'utf8')) : {};
  target = u.searchParams.has('xsec_token') ? u.href : (cached[u.pathname.split('/').pop()] || u.href);
  const resolved = new URL(target);
  if (resolved.origin !== u.origin || resolved.pathname !== u.pathname) throw new Error('Cached note URL mismatch');
}
fs.mkdirSync(state, { recursive: true });
const lock = path.join(state, 'reader.lock');
let fd;
try { fd = fs.openSync(lock, 'wx'); } catch { throw new Error('Reader busy or prior run needs inspection: ' + lock); }
fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
let context;
async function inspect(page) {
  return page.evaluate(() => {
    const visible = e => !!(e && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
    const dialog = [...document.querySelectorAll('[role="dialog"], .login-container, .login-modal, .captcha-container')].filter(visible).map(e => e.innerText).join('\n');
    const body = document.body?.innerText || '';
    const challenge = /\/captcha|website-login/.test(location.pathname) || /安全验证|拖动滑块|人机验证/.test(dialog) || (body.length < 1600 && /安全验证|访问频繁|操作过于频繁|账号异常/.test(body));
    const login = /扫码登录|手机号登录|短信登录|登录后查看|登录后搜索/.test(dialog) || (body.length < 1600 && /扫码登录|手机号登录|登录后搜索/.test(body));
    const self = [...document.querySelectorAll('a[href^="/user/profile/"]')].find(e => visible(e) && e.innerText.trim() === '我');
    return { url: location.href, title: document.title, blocked: challenge ? 'verification-or-rate-limit' : login ? 'login-required' : null, selfLink: !!self };
  });
}
try {
  const last = path.join(state, 'last-request.txt');
  const elapsed = Date.now() - Number(fs.existsSync(last) ? fs.readFileSync(last,'utf8') : 0);
  if (elapsed < 5000) await new Promise(r => setTimeout(r, 5000 - elapsed));
  fs.writeFileSync(last, String(Date.now()));
  if (!chrome) throw new Error('Chrome not found. Install Chrome or set XHS_CHROME_PATH.');
  context = await chromium.launchPersistentContext(path.join(state,'chrome-profile'), {
    executablePath: chrome,
    headless: false, viewport: { width: 1280, height: 900 }, locale: 'zh-CN'
  });
  const page = context.pages()[0] || await context.newPage();
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3000);
  let observed = await inspect(page);
  if (new URL(observed.url).origin !== 'https://www.xiaohongshu.com') throw new Error('Unexpected external redirect; stopped');
  let result;
  if (command === 'login') {
    console.error('LOGIN_WINDOW_OPEN: Complete normal login in Chrome; waiting up to 5 minutes.');
    const deadline = Date.now() + 300000;
    while (Date.now() < deadline && !observed.selfLink) { await page.waitForTimeout(2000); observed = await inspect(page); }
    result = { ...observed, status: observed.selfLink && !observed.blocked ? 'logged-in-visible' : 'login-not-confirmed' };
  } else if (observed.blocked) {
    result = { ...observed, status: 'blocked' }; process.exitCode = 3;
  } else if (command === 'status') {
    result = { ...observed, status: observed.selfLink ? 'logged-in-visible' : 'login-unconfirmed' };
  } else if (command === 'search') {
    if (!observed.selfLink) throw new Error('Login unconfirmed; stop before extracting');
    await page.waitForFunction(() => document.querySelector('section.note-item, .note-item') || document.querySelector('.login-container'), undefined, { timeout: 10000 }).catch(() => {});
    observed = await inspect(page);
    if (observed.blocked) throw new Error('Blocked: ' + observed.blocked);
    const feeds = await searchCards(page);
    const items = feeds.items.filter(x => x.kind === 'note' && x.id && x.title && x.href);
    const cachePath = path.join(state, 'note-links.json');
    const links = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath,'utf8')) : {};
    for (const item of items) { links[item.id] = item.href; item.href = 'https://www.xiaohongshu.com/explore/' + item.id; delete item.xsecToken; }
    fs.writeFileSync(cachePath, JSON.stringify(links,null,2));
    result = { ...observed, query: value, status: items.length ? 'read' : 'no-confirmed-results', items, sourceSummary: feeds.sourceSummary };
  } else {
    if (!observed.selfLink) throw new Error('Login unconfirmed; stop before extracting');
    await page.waitForSelector('#detail-title, #detail-desc', {timeout:10000}).catch(() => {});
    observed = await inspect(page);
    if (observed.blocked || new URL(observed.url).origin !== 'https://www.xiaohongshu.com' || new URL(observed.url).pathname !== new URL(target).pathname) throw new Error('Blocked or wrong note; stopped');
    const note = await page.evaluate(() => {
      const text = selector => document.querySelector(selector)?.innerText?.trim() || '';
      const visible = e => e.getClientRects().length > 0;
      return {
        title: text('#detail-title'), body: text('#detail-desc'),
        author: text('.author-container .username'), date: text('.note-content .date') || text('.date'),
        visibleComments: [...document.querySelectorAll('.comment-item')].filter(visible).slice(0,20).map(e => e.innerText.trim()),
        imageUrls: [...document.querySelectorAll('.note-detail-mask .swiper-slide img, .note-container .swiper-slide img')].map(e => e.currentSrc || e.src).filter(Boolean),
        video: (() => { const v = document.querySelector('video'); return v ? { present: true, durationSeconds: Number.isFinite(v.duration) ? v.duration : null, poster: v.poster || null, watched: false, transcriptAvailable: false } : { present: false, watched: false }; })(),
        imageTextRead: false, commentsComplete: false
      };
    });
    result = { ...observed, status: note.body || note.title ? 'read' : 'content-not-found', ...note };
    if (command === 'dots') {
      if (!note.video.present)throw new Error('No video found');
      const media=await resolveVideo(page);
      result.cloudTranscript=await transcribeDots({url:media.url,key:dotsKey,allowCloud:true});
    }
    if (command === 'frames') {
      if(timestamps.some(t=>!/^\d+(\.\d+)?$/.test(t)))throw new Error('Frame timestamps must be nonnegative seconds');
      if (!note.video.present) throw new Error('No video found');
      result.frameCapture = await captureFrames(page,state,note,{times:timestamps.map(Number),guard:async()=>{const seen=await inspect(page);if(seen.blocked || new URL(seen.url).origin!=='https://www.xiaohongshu.com' || new URL(seen.url).pathname!==new URL(target).pathname)throw new Error('Access restriction or navigation change; stopped');}});
    }
    if (command === 'video') {
      if (!note.video.present || !(note.body || note.title)) throw new Error('No verified video note');
      result.acquisition = await acquireVideo(page, state, note);
    }
  }
  const artifact = path.join(state, `result-${Date.now()}.json`);
  if (result.url) { const safeUrl = new URL(result.url); result.errorCode = safeUrl.searchParams.get('error_code') || undefined; result.url = safeUrl.origin + safeUrl.pathname; }
  result.fetchedAt = new Date().toISOString();
  result.sourceTrust = 'untrusted-user-content';
  fs.writeFileSync(artifact, JSON.stringify(result,null,2));
  console.log(JSON.stringify({ ...result, artifact },null,2));
} finally {
  if (context) await context.close().catch(() => {});
  try { fs.closeSync(fd); } catch {}
  try { fs.unlinkSync(lock); } catch {}
}

}
main().catch(error => { console.error(String(error.message).replace(/https?:\/\/[^\s]+/g, '[URL redacted]')); process.exitCode=2; });
