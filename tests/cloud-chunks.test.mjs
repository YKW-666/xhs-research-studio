import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {cloudChunks} from '../scripts/cloud-chunks.mjs';
import {dotsPayload} from '../scripts/dots-client.mjs';

const audio={mediaSha256:'a'.repeat(64),durationSeconds:4,chunks:[{start:0,end:4,data:'data:audio/wav;base64,UklGRg=='}]};
test('chunk cache avoids repeat cloud calls and rejects coverage gaps',async()=>{
  const state=fs.mkdtempSync(path.join(os.tmpdir(),'xhs-cloud-cache-'));let calls=0;
  const args={state,noteId:'1'.repeat(24),audio,key:'fixture',allowCloud:true,call:async()=>{calls++;return {finishReason:'stop',transcript:'fixture',usage:{prompt_tokens:5,completion_tokens:1}};}};
  const first=await cloudChunks(args);await cloudChunks(args);
  assert.equal(calls,1);assert.equal(first.requestIntervalsComplete,true);assert.equal(first.coverageVerified,false);
  await assert.rejects(cloudChunks({...args,audio:{...audio,durationSeconds:5}}),/tail/);
  assert.equal(dotsPayload(audio.chunks[0].data,'audio').messages[1].content[0].type,'audio_url');
});
test('uncertain calls retain a receipt and never automatically retry',async()=>{
  const state=fs.mkdtempSync(path.join(os.tmpdir(),'xhs-cloud-pending-'));let calls=0;
  const args={state,noteId:'2'.repeat(24),audio,key:'fixture',allowCloud:true,call:async()=>{calls++;throw new Error('network timeout fixture');}};
  await assert.rejects(cloudChunks(args),/timeout/);await assert.rejects(cloudChunks(args),/uncertain/);assert.equal(calls,1);
});

test('provider refusal is saved for review but never counts as a transcript',async()=>{
  const state=fs.mkdtempSync(path.join(os.tmpdir(),'xhs-cloud-refusal-'));let calls=0;
  const args={state,noteId:'3'.repeat(24),audio,key:'fixture',allowCloud:true,call:async()=>{calls++;return {finishReason:'stop',transcript:'[无法访问音轨]'};}};
  await assert.rejects(cloudChunks(args),/no usable transcript/);
  await assert.rejects(cloudChunks(args),/cache differs/);assert.equal(calls,1);
});
