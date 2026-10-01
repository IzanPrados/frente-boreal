import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createGame, applyCommand, snapshotFor } from '../shared/sim.mjs';
import { MAPS } from '../shared/maps.mjs';

// Isolated renderer workload: real simulation snapshot with 120 friendly units.
// The worker URL is intercepted only in this browser context; production has no debug API.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const results = [];
try {
  for (const map of MAPS) {
    const game = createGame({mode:'pvp', players:[{id:'local',team:0},{id:'opponent',team:1}],config:{mapId:map.id,startingResources:10000}});
    // Controlled workload, deliberately all visible to measure drawing the full cap.
    game.units=[];game.unitId=0;const player=game.players[0];
    for(let i=0;i<120;i++) {player.credits=10000;assert(applyCommand(game,'local',{type:'deploy',unitType:['infantry','tank','recon','supply','aa','helicopter'][i%6]}).ok)}
    game.units.forEach((u,i)=>{u.x=map.width/2+(i%12-5.5)*42;u.y=map.height/2+(Math.floor(i/12)-4.5)*35});
    const state=snapshotFor(game,'local');
    const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/client/solo-worker.mjs',route=>route.fulfill({contentType:'text/javascript',body:`onmessage=({data})=>{if(data.type==='start')postMessage({type:'state',state:${JSON.stringify(state)}})}`}));
    await page.goto(process.env.GAME_URL||'http://127.0.0.1:8787');await page.locator('#soloButton').click();await page.locator('#configMap').selectOption(map.id);await page.locator('#confirmConfig').click();
    await page.waitForFunction(()=>window.__FB__?.state?.units.length===120);await page.locator('#mapToggle').click();await page.locator('#overviewButton').click();await page.locator('[data-close="mapPanel"]').click();
    await page.waitForTimeout(1500);
    const sample=await page.evaluate(async()=>{
      const gl=document.querySelector('#viewport canvas').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');const frames=[];let last;
      await new Promise(resolve=>{const start=performance.now();const tick=now=>{if(last!==undefined)frames.push(now-last);last=now;if(now-start<6000)requestAnimationFrame(tick);else resolve()};requestAnimationFrame(tick)});
      const sorted=[...frames].sort((a,b)=>a-b),avg=frames.reduce((a,b)=>a+b,0)/frames.length;
      return{adapter:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unknown',sampleSeconds:6,frames:frames.length,fps:Math.round(1000/avg),frameMs:{mean:avg,p95:sorted[Math.floor(sorted.length*.95)]},render:window.__FB__.renderStats,viewport:{width:innerWidth,height:innerHeight}};
    });
    assert(!/SwiftShader|llvmpipe|Software Rasterizer/i.test(sample.adapter));assert.deepEqual(errors,[]);
    results.push({map:map.id,width:map.width,height:map.height,units:120,...sample});
    console.log(JSON.stringify(results.at(-1)));await context.close();
  }
} finally {await browser.close()}
await writeFile(new URL('../docs/RENDER-MEDICION.json',import.meta.url),JSON.stringify({date:new Date().toISOString(),browser:'Edge/Chromium',workload:'Synthetic placement of 120 real units; desktop GPU, 6 seconds per map. Not mobile or a full match.',results},null,2)+'\n');
