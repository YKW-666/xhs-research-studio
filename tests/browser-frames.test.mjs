import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright';
import {frameTimes,captureFrames} from '../scripts/browser-frames.mjs';

test('bounded frame selection rejects invalid inputs',()=>{
  assert.equal(frameTimes(60).length,8);
  assert.deepEqual(frameTimes(60,[10,10,20]),[10,20]);
  for(const duration of [NaN,Infinity,0,1801])assert.throws(()=>frameTimes(duration));
  for(const times of [[-1],[60],[NaN],Array(13).fill(1)])assert.throws(()=>frameTimes(60,times));
});

test('browser-only frame capture works without Python or model and stops on guard failure',async()=>{
  const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/synthetic-video.json',import.meta.url),'utf8'));
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'xhs-light-'));
  try {
    const p=await browser.newPage();
    await p.route('**/*',route=>{
      if(!route.request().url().endsWith('/fixture.mp4'))return route.fulfill({contentType:'text/html',body:'<video src="/fixture.mp4" width="320" height="180" preload="auto" muted></video>'});
      const bytes=Buffer.from(fixture.base64,'base64');
      const range=route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/);
      const start=range?Number(range[1]):0;const end=range&&range[2]?Number(range[2]):bytes.length-1;
      return route.fulfill({status:range?206:200,contentType:'video/mp4',headers:{'Accept-Ranges':'bytes',...(range?{'Content-Range':`bytes ${start}-${end}/${bytes.length}`}:{})},body:bytes.subarray(start,end+1)});
    });
    await p.goto('https://www.xiaohongshu.com/explore/123456789012345678901234');
    const r=await captureFrames(p,out,{title:'synthetic'},{times:[0.2,2.5]});
    assert.equal(r.frames.length,2);assert.equal(r.status,'sampled-frames-ready');
    assert.equal(r.audioTranscribed,false);assert.equal(r.visualReviewed,false);
    assert.notDeepEqual(fs.readFileSync(r.frames[0].file),fs.readFileSync(r.frames[1].file));
    await assert.rejects(captureFrames(p,out,{}, {guard:async()=>{throw new Error('blocked fixture');}}),/blocked fixture/);
  } finally {await browser.close();}
});
