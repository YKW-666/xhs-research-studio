import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export function mediaUrl(raw) {
  const u = new URL(raw);
  if (u.protocol === 'http:') u.protocol = 'https:';
  if (u.protocol !== 'https:' || u.username || u.password || u.port ||
      !(u.hostname === 'xhscdn.com' || u.hostname.endsWith('.xhscdn.com'))) {
    throw new Error('Refused non-Xiaohongshu media host');
  }
  return u.href;
}

export async function resolveVideo(page) {
  if (new URL(page.url()).origin !== "https://www.xiaohongshu.com") throw new Error("Unexpected media page");
  const id = new URL(page.url()).pathname.split('/').pop();
  if (!/^[a-f0-9]{24}$/.test(id)) throw new Error('Invalid note ID');
  await page.waitForFunction(() => {
    const video=document.querySelector('video');
    return video && Number.isFinite(video.duration) && video.duration>0;
  }, undefined, {timeout:15000}).catch(()=>{throw new Error('Video metadata is not ready; stopped without retry');});
  const media = await page.evaluate(id => {
    // Same state fields as yt-dlp's XiaoHongShuIE, obtained from the authenticated page.
    const entry = window.__INITIAL_STATE__?.note?.noteDetailMap?.[id]?.note;
    const streams = Object.values(entry?.video?.media?.stream || {}).flat();
    const candidates = streams.filter(s => s?.masterUrl).map(s => ({url:s.masterUrl,width:s.width,height:s.height,size:s.size}));
    const v = document.querySelector('video');
    if (!candidates.length && v?.currentSrc?.startsWith('https:')) candidates.push({url:v.currentSrc});
    return {candidates, duration: v?.duration};
  }, id);
  if (!Number.isFinite(media.duration) || media.duration <= 0 || media.duration > 1800) throw new Error('Missing duration or video exceeds 30-minute per-run limit');
  const candidates = media.candidates.filter(s => !s.size || s.size <= 500*1024*1024);
  candidates.sort((a,b) => Math.abs((a.height||720)-720)-Math.abs((b.height||720)-720));
  if (!candidates.length) throw new Error('No accessible bounded video stream; no bypass attempted');
  const url = mediaUrl(candidates[0].url);
  return {id,media,url};
}

export async function acquireVideo(page,state,note) {
  const {id,media,url}=await resolveVideo(page);
  const out = path.resolve(state,'video',id);
  fs.mkdirSync(out,{recursive:true});
  const receiptFile = path.join(out,'source.json');
  const file = path.join(out,'video.mp4');
  if (fs.existsSync(receiptFile) !== fs.existsSync(file) || fs.existsSync(file+'.part')) {
    throw new Error('Incomplete prior acquisition; inspect local video/receipt/part before recovery');
  }
  if (fs.existsSync(receiptFile) && fs.existsSync(file)) {
    const old = JSON.parse(fs.readFileSync(receiptFile,'utf8'));
    if(old.noteId!==id || old.file!==file || old.sourceUrl!==`https://www.xiaohongshu.com/explore/${id}` || old.bytes!==fs.statSync(file).size) throw new Error('Cached media identity mismatch');
    // Reuse only a content-verified complete acquisition, not a partial download.
    const h=createHash('sha256'); for await(const b of fs.createReadStream(file)) h.update(b);
    if (old.sha256 === h.digest('hex')) return {...old,reused:true,sourceManifest:receiptFile};
    throw new Error('Cached media integrity mismatch; inspect before replacing');
  }
  const response = await fetch(url, { redirect:'error', signal:AbortSignal.timeout(240000), headers:{Referer:'https://www.xiaohongshu.com/'} });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Media fetch rejected (${response.status}); stop without retry`); }
  const type=(response.headers.get('content-type')||'').split(';')[0].toLowerCase();
  if (!['video/mp4','application/octet-stream','video/octet-stream'].includes(type)) {await response.body?.cancel();throw new Error('Refused unexpected media content type');}
  const max = 500*1024*1024;
  if (Number(response.headers.get('content-length')) > max) {await response.body.cancel();throw new Error('Media too large');}
  const part = file+'.part';
  const fd = fs.openSync(part,'wx');
  let bytes=0; const hash=createHash('sha256');
  try {
    for await (const chunk of response.body) {
      bytes+=chunk.length; if(bytes>max) throw new Error('Media too large');
      hash.update(chunk); fs.writeFileSync(fd,chunk);
    }
    if (bytes<1024) throw new Error('Empty media');
    fs.closeSync(fd);
    const header=Buffer.alloc(12);const input=fs.openSync(part,'r');try{fs.readSync(input,header,0,12,0);}finally{fs.closeSync(input);}
    if(header.toString('ascii',4,8)!=='ftyp') throw new Error('Not an MP4 container');
    fs.renameSync(part,file);
  } catch(error) {try{fs.closeSync(fd);}catch{};try{fs.unlinkSync(part);}catch{};throw error;}
  const receipt={noteId:id,sourceUrl:`https://www.xiaohongshu.com/explore/${id}`,title:note.title,author:note.author,
    fetchedAt:new Date().toISOString(),durationSeconds:media.duration,bytes,sha256:hash.digest('hex'),file,
    acquisition:'authenticated-page-stream; no cookie export',audioTranscribed:false,visualReviewed:false};
  fs.writeFileSync(receiptFile+'.tmp',JSON.stringify(receipt,null,2));
  fs.renameSync(receiptFile+'.tmp',receiptFile);
  return {...receipt,sourceManifest:receiptFile};
}
