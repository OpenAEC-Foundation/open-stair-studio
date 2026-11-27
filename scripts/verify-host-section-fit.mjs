import assert from 'node:assert/strict';
import {checkHostFit} from '../src/host-ifc.js';

const rect=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
const bounds={min:[-10,-10,0],max:[1010,110,10]};
const floor=rect(-10,-10,1010,110);
const outline=rect(0,0,1000,100);
const island=rect(58,35,61,43);
const notch=[[-10,-10],[58,-10],[58,15],[61,15],[61,-10],[1010,-10],[1010,110],[-10,110]];
function ringWalls(ring) {
  return ring.flatMap((a,i)=>{
    const b=ring[(i+1)%ring.length];
    return [[[...a,0],[...b,0],[...b,10]],[[...a,0],[...b,10],[...a,10]]];
  });
}
function plate(ring) {
  return {points:ring.map(([x,y])=>({x,y})),elevation:10,thickness:10};
}
function host(openings, floorRings=[floor], slabBounds=bounds) {
  return {
    slabs:[{id:1,name:'Proefvloer',bounds:slabBounds,triangles:floorRings?.flatMap(ringWalls)}],
    openings:openings.map((rings,i)=>({id:i+2,triangles:rings.flatMap(ringWalls)})),
    voids:openings.map((_,i)=>({slabId:1,openingId:i+2})),
  };
}
function fit(rings, building, bim) {
  return checkHostFit({treads:rings.map(plate),landings:[],stringers:[]},building,bim).status;
}
const tests=[
  ['3 mm inspringing tussen oude controlepunten', [outline], host([[notch]]), 'outside'],
  ['vloereiland geheel omsloten door trede', [outline], host([[floor,island]]), 'outside'],
  ['smalle vloer geheel onder trede', [outline],host([], [island], {min:[58,35,0],max:[61,43,10]}),'outside'],
  ['trede dekt smalle sparing in kleine vloer', [outline],host([[island]], [island], {min:[58,35,0],max:[61,43,10]}),'precheck'],
  ['exact samenvallende grens', [outline],host([[outline]]),'precheck'],
  ['twee overlappende sparingen samen dekkend', [outline],host([[rect(-10,-10,600,110)],[rect(550,-10,1010,110)]]),'precheck'],
  ['twee sparingen met 3 mm tussenruimte', [outline],host([[rect(-10,-10,58,110)],[rect(61,-10,1010,110)]]),'outside'],
  ['eiland gevuld door tweede sparing', [outline],host([[floor,island],[island]]),'precheck'],
  ['materiaal van concave vloer', [island],host([], [notch]),'outside'],
  ['trap in inham van concave vloer binnen de omhulling', [rect(58.5,2,60.5,12)],host([], [notch]),'unknown'],
  ['uitsluitend contact aan buitenzijde vloer', [rect(1010,10,1020,50)],host([]),'unknown'],
  ['alleen vloeromhulling beschikbaar',[outline],host([],null),'unknown'],
  ['twee deels samenvallende trapdelen boven vloereiland',[outline,outline],host([[floor,island]]),'outside'],
  ['vloereiland tussen twee losse treden',[rect(0,0,50,100),rect(65,0,1000,100)],host([[floor,island]]),'precheck'],
];
const incomplete=host([[floor]]);
incomplete.openings[0].triangles.pop();
tests.push(['onvolledige sparingsring',[outline],incomplete,'unknown']);
const incompleteSlab=host([]);
incompleteSlab.slabs[0].triangles.pop();
tests.push(['onvolledige vloerring',[outline],incompleteSlab,'unknown']);
const offset={originX:2000,originY:-400,originRotationDeg:90};
const move=ring=>ring.map(([x,y])=>[2000-y,-400+x]);
tests.push(['inspringing na BIM-rotatie en verplaatsing',[outline],host(
  [[move(notch)]],[move(floor)],{min:[1890,-410,0],max:[2010,610,10]}
),'outside',offset]);
const partial=host([]);
partial.slabs.push({...partial.slabs[0],id:2});
partial.slabs[0]={...partial.slabs[0],triangles:null};
tests.push(['bekende botsing naast een onvolledige vloer',[outline],partial,'outside']);
let failures=0;
for (const [name,rings,model,expected,bim] of tests) {
  const actual=fit(rings,model,bim);
  if(actual!==expected){ ++failures; console.error(name,actual,'verwacht',expected); }
}
assert.equal(failures,0);
console.log(`Hostpassing: ${tests.length} vlakdoorsneden met inspringing, eiland, contact en overlappende objecten.`);
