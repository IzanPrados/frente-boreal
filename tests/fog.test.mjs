import test from 'node:test';
import assert from 'node:assert/strict';
import {createFogGrid,visibilityOutline} from '../client/fog.mjs';
import {VEGETATION_PRESETS} from '../shared/terrain.mjs';
const origin={x:40,y:100,z:2};
const map=(terrain=[],buildings=[])=>({width:400,height:200,terrain,buildings});
const east=grid=>visibilityOutline(grid,origin,280)[0].x;
test('fog display clips at the same building footprints used by gameplay',()=>{
 const grid=createFogGrid(map([],[{x:120,y:60,w:40,h:80,height:20}]));
 assert(east(grid)<120);assert(east(createFogGrid(map()))>300);
});
test('fog distinguishes partial vegetation densities and reconstruction vision',()=>{
 const grid=preset=>createFogGrid(map([{type:'forest',x:100,y:0,w:200,h:200,...preset}]));
 const sparse=grid(VEGETATION_PRESETS.isolated),dense=grid(VEGETATION_PRESETS.dense);
 assert(east(sparse)>east(dense)+90);
 assert(visibilityOutline(dense,origin,280,true)[0].x>east(dense));
});
test('window origin sees outdoors but does not see through its own back wall',()=>{
 const grid=createFogGrid(map([],[{x:120,y:60,w:40,h:80,height:20}]));
 const outline=visibilityOutline(grid,{x:164,y:100,z:5},200);
 assert(outline[0].x>300);assert(outline[48].x>=160);
});
