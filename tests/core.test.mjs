import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { searchCards } from '../scripts/search-cards.mjs';
import { mediaUrl, acquireVideo } from '../scripts/video-download.mjs';

test('reject unsupported commands and non-note URLs before opening Chrome',()=>{
  const cli=fileURLToPath(new URL('../scripts/reader.mjs',import.meta.url));
  for(const args of [['publish','test'],['read','https://evil.example/explore/123456789012345678901234'],['read','https://www.xiaohongshu.com/creator']]) {
    const r=spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});
    assert.notEqual(r.status,0);
  }
});

test('visible DOM search excludes hidden and external cards, preserves access link privately',async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try {
    const p=await browser.newPage();
    await p.setContent(`<section class="note-item"><a href="https://www.xiaohongshu.com/search_result/123456789012345678901234?xsec_token=fixture"><span class="title">Research fixture</span></a><div class="author"><span class="name">Example</span></div></section><section class="note-item" style="display:none"><a href="https://www.xiaohongshu.com/explore/aaaaaaaaaaaaaaaaaaaaaaaa"><span class="title">Hidden</span></a></section><section class="note-item"><a href="https://evil.example/explore/bbbbbbbbbbbbbbbbbbbbbbbb"><span class="title">External</span></a></section>`);
    const r=await searchCards(p);
    assert.equal(r.items.length,1);assert.equal(r.items[0].title,'Research fixture');assert.equal(r.items[0].author,'Example');
    assert.equal(new URL(r.items[0].href).pathname,'/explore/123456789012345678901234');
    assert.equal(new URL(r.items[0].href).searchParams.get('xsec_token'),'fixture');
  }finally{await browser.close();}
});

test('media allowlist and bounded cache fail closed on tampering',async()=>{
  for(const u of ['https://xhscdn.com.evil.test/x','http://localhost/x','https://x.xhscdn.com:8443/x','https://user:pass@x.xhscdn.com/x','file:///secret'])assert.throws(()=>mediaUrl(u));
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xhs-research-test-'));
  const page={url:()=> 'https://www.xiaohongshu.com/explore/123456789012345678901234',waitForFunction:async()=>{},evaluate:async()=>({duration:5,candidates:[{url:'https://sns-video-bd.xhscdn.com/fixture',height:720}]})};
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async (url,opts)=>{calls++;assert.equal(opts.redirect,'error');const b=Buffer.alloc(2048);b.write('ftyp',4);return new Response(b,{status:200,headers:{'content-type':'video/mp4'}});};
  try {
    const first=await acquireVideo(page,dir,{title:'fixture',author:'example'});
    assert.equal(first.bytes,2048);assert.equal((await acquireVideo(page,dir,{})).reused,true);assert.equal(calls,1);
    fs.appendFileSync(first.file,'tamper');await assert.rejects(acquireVideo(page,dir,{}),/mismatch/);
    await assert.rejects(acquireVideo({...page,evaluate:async()=>({duration:1801,candidates:[]})},dir,{}),/duration/);
    await assert.rejects(acquireVideo({...page,waitForFunction:async()=>{throw new Error('timeout');}},dir,{}),/metadata/);
  }finally{globalThis.fetch=original;}
});
