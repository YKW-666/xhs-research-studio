// Read rendered note cards only. No imported third-party skill implementation.
export async function searchCards(page) {
  const items = await page.locator('section.note-item').evaluateAll(cards => {
    const results=[];
    for (const card of cards) {
      if (!card.getClientRects().length) continue;
      const anchors=Array.from(card.querySelectorAll('a[href]'));
      const link=anchors.map(a=>new URL(a.getAttribute('href'),location.href)).find(u=>u.origin==='https://www.xiaohongshu.com' && /^\/(explore|search_result)\/[a-f0-9]{24}$/.test(u.pathname));
      if (!link) continue;
      const id=link.pathname.split('/').pop();
      if(results.some(r=>r.id===id)) continue;
      const title=(card.querySelector('.title')?.textContent || card.querySelector('img')?.alt || '').trim();
      if(!title) continue;
      const canonical=new URL('https://www.xiaohongshu.com/explore/'+id);
      for(const key of ['xsec_token','xsec_source']) if(link.searchParams.has(key))canonical.searchParams.set(key,link.searchParams.get(key));
      results.push({kind:'note',source:'visible-card',id,title,
        author:(card.querySelector('.author .name, .author-wrapper .name')?.textContent || '').trim(),
        href:canonical.href});
      if(results.length===10) break;
    }
    return results;
  });
  return {items,sourceSummary:{visibleCards:items.length}};
}
