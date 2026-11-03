const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const classic = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const sandbox = vm.createContext({
  localStorage:{getItem:()=>null},
  matchMedia:()=>({matches:false}),
  document:{querySelector:()=>null},
});
vm.runInContext(classic.slice(0,classic.indexOf('/* ======================= 颜色')),sandbox);
const run = source => vm.runInContext(source,sandbox);

// Exercise the actual roam collision code against slanted and curved boundaries.
const blocked = html.slice(html.indexOf('function blocked('),html.indexOf('function stepWalk('));
run(`const wx=x=>x/1000,wz=y=>y/1000,clamp01=x=>Math.max(0,Math.min(1,x));
  let colliders=[],doors=[]; ${blocked}`);

test('photo dimensions, room topology and openings stay finite and non-degenerate',()=>{
  assert.equal(run('CEILING_HEIGHT'),3.3);
  assert.equal(run('ROOMS.filter(r=>["master","north-bed","south-bed","curve-bed"].includes(r.id)).length'),4);
  assert.equal(run('ROOMS.filter(r=>r.name.includes("卫浴")).length'),3);
  assert.equal(run('ROOMS.every(r=>r.poly.length>=3 && r.poly.every(p=>p.every(Number.isFinite)) && area(r.poly)>0)'),true);
  assert.equal(run('WALLS.every(w=>w[2]>w[0] && w[3]>w[1])'),true);
  assert.equal(run('WINS.every(w=>Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1])>0 && w.t>0 && w.head>w.sill)'),true);
  assert.equal(run('DOORS.every(d=>Math.abs(Math.hypot(...d.c)-1)<1e-9 && Math.abs(Math.hypot(...d.o)-1)<1e-9 && Math.abs(d.c[0]*d.o[0]+d.c[1]*d.o[1])<1e-9)'),true);
  assert.equal(run('defaultFurniture().every(f=>ROOMS.some(r=>pointInPoly(f.cx,f.cy,r.poly)))'),true);
});

test('diagonal wall collision follows the wall instead of blocking its entire bounding box',()=>{
  run('colliders=[wallPoly(segmentWall([0,0],[2000,2000],200)).map(([x,y])=>[wx(x),wz(y)])]; doors=[];');
  assert.equal(run('blocked(1,1)'),true);
  assert.equal(run('blocked(.4,1.6)'),false);
  assert.equal(run('blocked(1,1.3)'),true); // player radius touches the wall
});

test('curved glazing blocks walking at the curve and leaves the bedroom interior accessible',()=>{
  run('colliders=WINS.filter(w=>BEDROOM_ARC.some(p=>p[0]===w.a[0] && p[1]===w.a[1])).map(w=>wallPoly(windowWall(w)).map(([x,y])=>[wx(x),wz(y)]));');
  assert.equal(run('blocked(11.545,13.95)'),true);
  assert.equal(run('blocked(11.545,13.3)'),false);
});

test('double entrance leaves use their own length for collisions',()=>{
  run('colliders=[]; doors=[{pivot:{rotation:{y:0},position:{x:0,z:0}},len:.6}];');
  assert.equal(run('blocked(.4,0)'),true);
  assert.equal(run('blocked(.85,0)'),false);
});

test('new storage is isolated and exported state survives a JSON round trip',()=>{
  assert.equal(run('STORE'),'huxing-design-img-0914-v1');
  assert.equal(run('STORE === "huxing-design-v1"'),false);
  assert.equal(run('(()=>{const d=defaultState(),r=fixState(JSON.parse(JSON.stringify(d))); return r.planId===PLAN_ID && r.furniture.length===d.furniture.length && Object.keys(r.rooms).length===ROOMS.length;})()'),true);
  assert.equal(run('fixState({furniture:[],rooms:{old:{name:"Old room"}},demolished:["w0"]}).demolished.length'),0);
  assert.equal(run('Object.hasOwn(fixState({furniture:[],rooms:{old:{}}}).rooms,"old")'),false);
});


test('bedroom side glazing has two outward casements and no exterior door',()=>{
  assert.equal(run('WINS.filter(w=>w.casement).length'),2);
  assert.equal(run('DOORS.some(d=>d.name==="西侧外门")'),false);
  assert.equal(run(`WINS.filter(w=>w.casement).every(w=>{
    const {h,o,len}=windowLeaf(w), master=ROOMS.find(r=>r.id==='master');
    return !pointInPoly(h[0]+o[0]*len,h[1]+o[1]*len,master.poly);
  })`),true);
  run('doors=[];colliders=WINS.filter(w=>w.casement).map(w=>wallPoly(windowWall(w)).map(([x,y])=>[wx(x),wz(y)]));');
  assert.equal(run('blocked(-.41,8.545)'),true); // former exterior door is now a window sill
});

test('staff room labels migrate without discarding customized names or furniture',()=>{
  assert.equal(run(`fixState({furniture:[],rooms:{'north-bed':{name:'北卧室'},'north-bath':{name:'北卫浴'}}}).rooms['north-bed'].name`),'保姆房');
  assert.equal(run(`fixState({furniture:[],rooms:{'north-bath':{name:'北卫浴'}}}).rooms['north-bath'].name`),'保姆房卫浴');
  assert.equal(run(`fixState({furniture:[{id:'kept'}],rooms:{'north-bed':{name:'自定义名称'}}}).rooms['north-bed'].name`),'自定义名称');
  assert.equal(run(`fixState({furniture:[{id:'kept'}]}).furniture[0].id`),'kept');
});

test('door picking ignores invisible geometry and outlines while respecting solid walls',()=>{
  const ctx=vm.createContext({});
  vm.runInContext(`const scene={},camera={},glassMat={},furnG={},archUp={},archFloor={},opt={furn:true};
    const renderer={domElement:{getBoundingClientRect:()=>({left:0,top:0,width:600,height:600})}};
    let hits=[];const ptr={set(){}},ray={setFromCamera(){},intersectObjects:()=>hits};
    const door={open:true},leaf={isMesh:true,visible:true,material:{},userData:{door}};
    const hiddenCeiling={isMesh:true,visible:false,material:{},userData:{}};
    const outline={isMesh:false,visible:true,material:{},userData:{}};
    const hiddenParent={isMesh:true,visible:true,material:{},userData:{},parent:{visible:false}};
    const glass={isMesh:true,visible:true,material:glassMat,userData:{}};
    const wall={isMesh:true,visible:true,material:{},userData:{}};
    ${html.slice(html.indexOf('function visibleMesh('),html.indexOf('// 屏幕点 → 地面'))}`,ctx);
  const pickRun=s=>vm.runInContext(s,ctx);
  pickRun(`hits=[outline,hiddenCeiling,hiddenParent,glass,leaf].map((object,i)=>({object,distance:i+1}));`);
  assert.equal(pickRun('pick({clientX:300,clientY:300}).door===door'),true);
  assert.equal(pickRun('pick().dist'),5);
  pickRun('hits=[{object:wall,distance:1},{object:leaf,distance:2}];');
  assert.equal(pickRun('pick()'),null);
  pickRun('hits=[{object:leaf,distance:1},{object:wall,distance:2}];');
  assert.equal(pickRun('pick().door===door'),true);
  vm.runInContext(`const notices=[];function toast(s){notices.push(s);}function tr(zh){return zh;}
    ${html.slice(html.indexOf('function toggleDoor('),html.indexOf('function visibleMesh('))}
    toggleDoor(pick().door);`,ctx);
  assert.equal(pickRun('door.open'),false);
  assert.equal(pickRun('notices[0]'),'门已关闭');
  pickRun('toggleDoor(pick().door);');
  assert.equal(pickRun('door.open'),true);
  assert.equal(pickRun('notices[1]'),'门已打开');
});
