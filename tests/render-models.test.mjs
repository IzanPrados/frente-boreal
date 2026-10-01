import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {MAPS} from '../shared/maps.mjs';
import {UNIT_TYPES} from '../shared/data.mjs';
import {makeBuildingModel,makeUnitModel} from '../client/models.mjs';
import {unitIdentity} from '../client/symbols.mjs';
const materials=new Map();
const material=color=>{if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color}));return materials.get(color)};
test('rendered buildings preserve the authored footprint and maximum obstacle height',()=>{
 const before=JSON.stringify(MAPS),styles=new Set();
 for(const map of MAPS)for(const building of map.buildings){
  const model=makeBuildingModel(THREE,building,material),box=new THREE.Box3().setFromObject(model);
  assert(box.min.x>=building.x-.61&&box.max.x<=building.x+building.w+.61,building.id+' width');
  assert(box.min.z>=building.y-.61&&box.max.z<=building.y+building.h+.61,building.id+' depth');
  assert(box.min.y>=-.01&&box.max.y<=building.height+.01,building.id+' height');
  assert(Math.abs(box.max.y-building.height)<.1,building.id+' fills height');
  styles.add(model.userData.roof+'-'+model.userData.variant);
  model.traverse(part=>part.geometry?.dispose());
 }
 assert(styles.size>=4);assert.equal(JSON.stringify(MAPS),before);
});
test('all nine unit models have finite original geometry without altering gameplay statistics',()=>{
 const before=JSON.stringify(UNIT_TYPES),sizes=new Set();
 for(const type of Object.keys(UNIT_TYPES)){
  const model=makeUnitModel(THREE,type,0,material),size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  assert([size.x,size.y,size.z].every(value=>Number.isFinite(value)&&value>0));
  sizes.add(size.toArray().join(','));
  model.traverse(part=>{if(part.geometry){assert([...part.geometry.attributes.position.array].every(Number.isFinite));part.geometry.dispose()}});
 }
 assert(sizes.size>=8);assert.equal(JSON.stringify(UNIT_TYPES),before);
});
test('ownership uses distinct shapes, team color and separate reveal indication',()=>{
 const own=unitIdentity({ownerId:'me',team:0},'me',0),ally=unitIdentity({ownerId:'friend',team:0},'me',0);
 const enemy=unitIdentity({ownerId:'other',team:1,displayOnly:true},'me',0);
 assert.equal(own.shape,'circle');assert.equal(ally.shape,'square');assert.equal(enemy.shape,'diamond');
 assert.equal(enemy.displayOnly,true);assert.equal(own.displayOnly,false);
 assert.equal(unitIdentity({ownerId:'me',team:1},'me',1).shape,'circle');
});
