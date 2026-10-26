import fs from 'node:fs';
import path from 'node:path';

export function frameTimes(duration, requested=[]) {
  if (!Number.isFinite(duration) || duration<=0 || duration>1800) throw new Error('Video duration unavailable or exceeds 30 minutes');
  if (requested.length>12 || requested.some(t=>!Number.isFinite(t)||t<0||t>=duration)) throw new Error('Supply at most 12 timestamps inside the video');
  const times=requested.length ? requested : Array.from({length:8},(_,i)=>i*Math.max(0,duration-0.25)/7);
  return [...new Set(times.map(t=>Math.round(t*1000)/1000))];
}

export async function captureFrames(page,state,note,{times=[],guard=async()=>{}}={}) {
  const url=new URL(page.url());
  if(url.origin!=='https://www.xiaohongshu.com' || !/^\/(explore|discovery\/item)\/[a-f0-9]{24}$/.test(url.pathname))throw new Error('Unexpected video page');
  await guard();
  const video=page.locator('video').first();
  await page.waitForFunction(()=>{const v=document.querySelector('video');return v&&Number.isFinite(v.duration)&&v.duration>0;},undefined,{timeout:15000});
  const duration=await video.evaluate(v=>v.duration);
  const original=await video.evaluate(v=>({time:v.currentTime,muted:v.muted,paused:v.paused}));
  const selected=frameTimes(duration,times);
  const out=path.resolve(state,'browser-frames',url.pathname.split('/').pop(),String(Date.now()));
  fs.mkdirSync(out,{recursive:true});
  const result={sourceUrl:url.origin+url.pathname,title:note.title,durationSeconds:duration,
    mode:'browser-only',audioTranscribed:false,visualReviewed:false,frames:[],status:'in-progress'};
  const manifest=path.join(out,'frames.json');
  const save=()=>fs.writeFileSync(manifest,JSON.stringify(result,null,2));
  try {
    for(const seconds of selected) {
      await guard();
      await video.evaluate((v,t)=>{v.muted=true;v.pause();v.currentTime=t;},seconds);
      await page.waitForFunction(t=>{const v=document.querySelector('video');return v&&!v.seeking&&v.readyState>=2&&Math.abs(v.currentTime-t)<0.75;},seconds,{timeout:20000});
      await page.waitForTimeout(150);
      await guard();
      const actual=await video.evaluate(v=>v.currentTime);
      const file=path.join(out,`frame-${seconds.toFixed(3)}.jpg`);
      await video.screenshot({path:file,type:'jpeg',quality:85,timeout:10000});
      result.frames.push({requestedSeconds:seconds,decodedSeconds:actual,file});save();
    }
    result.status='sampled-frames-ready';save();
    return {...result,manifest};
  }catch(error){result.status='incomplete';save();throw error;}
  finally {
    try {
      await guard();
      await video.evaluate((v,old)=>{v.pause();v.currentTime=old.time;v.muted=old.muted;if(!old.paused)void v.play().catch(()=>{});},original);
    } catch { /* Do not touch a page that has navigated or become blocked. */ }
  }
}
