import test from 'node:test';
import assert from 'node:assert/strict';
import {dotsPayload,transcribeDots} from '../scripts/dots-client.mjs';

test('Dots is opt-in and rejects unsafe destinations',async()=>{
  await assert.rejects(transcribeDots({url:'https://sns-video-bd.xhscdn.com/a',key:'fixture'}),/consent/);
  for(const u of ['http://x.xhscdn.com/a','https://evil.example/a','file:///key','https://user:pass@x.xhscdn.com/a'])assert.throws(()=>dotsPayload(u));
  assert.equal(dotsPayload('https://sns-video-bd.xhscdn.com/a').messages[1].content[0].type,'video_url');
});

test('official Dots protocol and conservative completion labels',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async (url,options)=>{
    assert.equal(url,'https://note3-prev-api.askdiandian.com/v1/chat/completions');
    assert.equal(options.redirect,'error');assert.equal(options.headers['api-key'],'fixture');
    assert.equal(JSON.parse(options.body).model,'dots3-note-prev');
    return new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'partial fixture'}}]}),{status:200});
  };
  try {
    const r=await transcribeDots({url:'https://sns-video-bd.xhscdn.com/a',key:'fixture',allowCloud:true});
    assert.equal(r.status,'possibly-incomplete');assert.equal(r.accuracyVerified,false);assert.equal(r.timestampsVerified,false);
    globalThis.fetch=async()=>new Response('not logged',{status:401});
    await assert.rejects(transcribeDots({url:'https://sns-video-bd.xhscdn.com/a',key:'fixture',allowCloud:true}),/401/);
  }finally{globalThis.fetch=original;}
});
