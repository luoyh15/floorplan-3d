const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const classic=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
function app(initial={}){
  const storage=new Map(Object.entries(initial)),nodes=new Map(),notices=[];
  let storageFails=false;
  const ctx=vm.createContext({
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>{if(storageFails) throw Error('Storage full');storage.set(k,v);}},
    document:{querySelector:k=>{if(!nodes.has(k)) nodes.set(k,{});return nodes.get(k);}},
    matchMedia:()=>({matches:false}),window:{View3D:{resetPlan(){}}},
    notices,
  });
  vm.runInContext(classic.slice(0,classic.indexOf('/* ======================= 颜色')),ctx);
  vm.runInContext(`let switching=false,viewMode='2d',drag=null,libDrag=null; const touches=new Map();
    const is3D=()=>viewMode==='3d'; async function setView(m){viewMode=m;}
    function toast(s){notices.push(s);} function renderPlanOptions(){} function renderOpenings(){}
    function renderDims(){} function fitView(){} function renderAll(){} function setTool(t){ui.tool=t;}
  `,ctx);
  vm.runInContext(classic.slice(classic.indexOf('function save(){'),classic.indexOf('const snap =')),ctx);
  vm.runInContext(classic.slice(classic.indexOf('async function switchPlan('),classic.indexOf("$('#planSelect').onchange")),ctx);
  const run=source=>vm.runInContext(source,ctx);
  return{run,storage,notices,failStorage:()=>{storageFails=true;}};
}

test('each layout restores its own furniture, rooms and measurements',async()=>{
  const {run,storage}=app();
  run(`state.furniture[0].cx=8765;state.rooms.master.name='我的主卧';state.measures=[{a:{x:0,y:0},b:{x:1000,y:0}}];undoStack.push('old');`);
  assert.equal(await run(`switchPlan('original')`),true);
  assert.equal(run('CEILING_HEIGHT'),2.8);
  assert.equal(run('undoStack.length'),0);
  run('state.furniture[0].cx=8123;');
  assert.equal(await run(`switchPlan('img-0914')`),true);
  assert.equal(run('CEILING_HEIGHT'),3.3);
  assert.equal(run('state.furniture[0].cx'),8765);
  assert.equal(run('state.rooms.master.name'),'我的主卧');
  assert.equal(run('state.measures.length'),1);
  assert.equal(run('WINS.filter(w=>w.casement).length'),2);
  await run(`switchPlan('original')`);
  assert.equal(run('state.furniture[0].cx'),8123);
  assert.ok(storage.has('huxing-design-v1'));
  assert.ok(storage.has('huxing-design-img-0914-v2'));
});

test('reopening the app restores the last selection and old original-layout storage',async()=>{
  const first=app();
  await first.run(`switchPlan('original')`);
  first.run('state.furniture[0].cx=8550;save();');
  const legacy=JSON.parse(first.storage.get('huxing-design-v1'));delete legacy.planId;
  first.storage.set('huxing-design-v1',JSON.stringify(legacy));
  const reopened=app(Object.fromEntries(first.storage));
  assert.equal(reopened.run('PLAN_ID'),'original');
  assert.equal(reopened.run('state.furniture[0].cx'),8550);
});

test('full JSON import adds another layout without overwriting built-ins',async()=>{
  const {run,storage}=app();
  run(`const doc=exportPlanDocument();doc.plan.ceilingHeight=3.6;doc.plan.name='另一个户型';doc.state.furniture[0].cx=8600;`);
  assert.equal(await run('importPlanDocument(doc)'),true);
  assert.notEqual(run('PLAN_ID'),'img-0914');
  assert.equal(run('CEILING_HEIGHT'),3.6);
  assert.equal(run('state.furniture[0].cx'),8600);
  assert.equal(run(`findPlan('img-0914').ceilingHeight`),3.3);
  assert.equal(JSON.parse(storage.get('huxing-custom-plans-v1')).length,1);
  const reopened=app(Object.fromEntries(storage));
  assert.equal(reopened.run('CEILING_HEIGHT'),3.6);
  assert.equal(reopened.run('allPlans().length'),4);
});

test('matching JSON imports restore state and legacy JSON selects the correct layout',async()=>{
  const {run}=app();
  run(`const doc=exportPlanDocument();doc.state.rooms.master.name='导入的主卧';`);
  await run(`switchPlan('original')`);
  assert.equal(await run('importPlanDocument(doc)'),true);
  assert.equal(run('PLAN_ID'),'img-0914');
  assert.equal(run('state.rooms.master.name'),'导入的主卧');
  assert.equal(run('customPlans.length'),0);
  await run(`switchPlan('original');`);
  run('const legacy=copyData(state);delete legacy.planId;');
  await run(`switchPlan('img-0914')`);
  assert.equal(await run('importPlanDocument(legacy)'),true);
  assert.equal(run('PLAN_ID'),'original');
});

test('switching in 3D preserves viewing mode and keeps original wall edits separate',async()=>{
  const {run}=app();
  run(`viewMode='3d';`);await run(`switchPlan('original')`);
  run(`const removable=WALLS.findIndex(w=>w[4]==='n');state.demolished=['w'+removable];`);
  await run(`switchPlan('img-0914')`);
  assert.equal(run('viewMode'),'3d');assert.equal(run('state.demolished.length'),0);
  await run(`switchPlan('original')`);assert.equal(run('state.demolished.length'),1);
});

test('storage failures and malformed imports preserve the current layout',async()=>{
  const {run,failStorage}=app();
  run('state.furniture[0].cx=8888;');failStorage();
  assert.equal(await run(`switchPlan('original')`),false);
  assert.equal(run('PLAN_ID'),'img-0914');assert.equal(run('state.furniture[0].cx'),8888);
  await assert.rejects(()=>run(`importPlanDocument({format:'floorplan-3d',version:2,plan:{id:'broken'},state:{furniture:[]}})`));
  assert.equal(run('PLAN_ID'),'img-0914');
});

test('committed JSON snapshots are valid full layouts including the corrected windows',()=>{
  const {run}=app();
  for(const id of ['img-0914','original','bathroom-1800-1700']){
    const data=fs.readFileSync(path.join(__dirname,`../floorplans/${id}.json`),'utf8');
    assert.equal(run(`validPlan(${data}.plan)`),true);
  }
  const mine=JSON.parse(fs.readFileSync(path.join(__dirname,'../floorplans/img-0914.json'),'utf8'));
  assert.equal(mine.plan.ceilingHeight,3.3);
  assert.equal(mine.plan.windows.filter(w=>w.casement).length,2);
  assert.equal(mine.plan.rooms.find(r=>r.id==='north-bed').name,'保姆房');
});

test('bathroom glazing replaces the upper top and right walls and preserves saved arrangements',async()=>{
  const first=app();await first.run(`switchPlan('bathroom-1800-1700')`);
  first.run(`state.planRevision=11;state.furniture.find(f=>f.type==='toilet').cx=820;
    state.demolished=['w4'];save();`);
  const {run}=app(Object.fromEntries(first.storage));
  assert.equal(run('state.planRevision'),run('activePlan.revision'));
  assert.equal(run('state.furniture.find(f=>f.type==="toilet").cx'),820);
  assert.equal(run('state.demolished.join(",")'),'w2');
  assert.equal(run('WINS.length'),2);
  assert.equal(run('WINS.every(w=>w.sill===1 && w.head===CEILING_HEIGHT && !w.casement)'),true);
  const bases=JSON.parse(run('JSON.stringify(WINS.map(windowWall))'));
  assert.deepEqual(bases.map(w=>w.slice(0,4)),[[-100,-100,1800,0],[1700,0,1800,1900]]);
  assert.ok(bases.every(w=>w[5]===null));
  assert.equal(run('WALLS.some(w=>w[0]===1700 || w[1]===-100)'),false);
  assert.equal(run('validPlan(activePlan)'),true);
  const snapshot=JSON.parse(fs.readFileSync(path.join(__dirname,'../floorplans/bathroom-1800-1700.json'),'utf8'));
  assert.deepEqual(snapshot.plan.windows,JSON.parse(run('JSON.stringify(WINS)')));
  assert.deepEqual(snapshot.plan.walls,JSON.parse(run('JSON.stringify(WALLS)')));
});

test('explicit save keeps a complete snapshot of the current structure and arrangement',()=>{
  const {run,storage}=app();run(`state.rooms.master.name='保存的房间';state.furniture[0].cx=8720;saveCurrentPlan();`);
  const snapshot=JSON.parse(storage.get('huxing-snapshot-img-0914-v1'));
  assert.equal(snapshot.plan.ceilingHeight,3.3);
  assert.equal(snapshot.plan.windows.filter(w=>w.casement).length,2);
  assert.equal(snapshot.state.rooms.master.name,'保存的房间');
  assert.equal(snapshot.state.furniture[0].cx,8720);
});

test('different viewport and dimension metadata also create a separate imported layout',async()=>{
  const {run}=app();run('const doc=exportPlanDocument();doc.plan.bounds.w+=1000;doc.plan.dimensions[0].at-=100;');
  await run('importPlanDocument(doc)');
  assert.notEqual(run('PLAN_ID'),'img-0914');
  assert.equal(run('BOUNDS.w'),24700);
  assert.equal(run(`findPlan('img-0914').bounds.w`),23700);
});

test('a second selection during an animated switch cannot replace the pending layout',async()=>{
  const {run}=app();
  run(`viewMode='3d';let releaseExit;setView=async m=>{if(m==='2d') await new Promise(r=>releaseExit=r);viewMode=m;};`);
  const firstSwitch=run(`switchPlan('original')`);
  assert.equal(await run(`switchPlan('img-0914')`),false);
  run('releaseExit();');await firstSwitch;
  assert.equal(run('PLAN_ID'),'original');assert.equal(run('viewMode'),'3d');
});

test('bathroom clear dimensions and confirmed toilet rough-in offsets are exact',async()=>{
  const {run}=app();await run(`switchPlan('bathroom-1800-1700')`);
  assert.equal(run('area(ROOMS[0].poly)'),3.06);
  assert.equal(run('bbox(ROOMS[0].poly).join(",")'),'0,0,1700,1800');
  assert.equal(run('state.furniture.find(f=>f.type==="shower").d'),730);
  assert.equal(run('WALLS.find(w=>w[4]==="low")[1]'),730);
  assert.equal(run('WALLS.find(w=>w[4]==="low")[3]'),800);
  assert.equal(run('WALLS.find(w=>w[4]==="low")[6]'),.05);
  assert.equal(run('state.furniture.some(f=>f.type==="toilet")'),true);
  assert.equal(run('activePlan.bathroomSpec.pipeLeftEdge'),305);
  assert.equal(run('activePlan.bathroomSpec.drainCenterY-800'),380);
  assert.equal(run('activePlan.bathroomSpec.pipeOuterDiameter'),130);
  assert.equal(run('activePlan.bathroomSpec.drainCenterX'),370);
  assert.equal(run('activePlan.bathroomSpec.curbDepth'),70);
  assert.equal(run('activePlan.bathroomSpec.dryDepth'),1000);
  assert.equal(run('activePlan.bathroomSpec.showerDepth+activePlan.bathroomSpec.curbDepth+activePlan.bathroomSpec.dryDepth'),1800);
  assert.equal(run('activePlan.annotations.find(a=>a.label==="380").a.join(",")'),'370,800');
  assert.equal(run('activePlan.annotations.find(a=>a.label==="380").b.join(",")'),'370,1180');
  assert.equal(run('activePlan.annotations.find(a=>a.label==="305").b.join(",")'),'305,1180');
  assert.equal(run('DOORS[0].rect.join(",")'),'900,1800,1700,1900');
  assert.equal(run('DOORS[0].o.join(",")'),'0,-1');
  assert.equal(run('pointInPoly(DOORS[0].h[0]+(DOORS[0].c[0]+DOORS[0].o[0])*DOORS[0].len/Math.sqrt(2),DOORS[0].h[1]+(DOORS[0].c[1]+DOORS[0].o[1])*DOORS[0].len/Math.sqrt(2),ROOMS[0].poly)'),true);
  assert.equal(run(`(()=>{const f=state.furniture.find(f=>f.type==='vanity');return [f.cx,f.cy,f.w,f.d,f.rot].join(',');})()`),'250,1650,300,500,270');
  assert.equal(run('!!state.furniture.find(f=>f.type==="vanity").showDimensions'),false);
  assert.equal(run('activePlan.annotations.filter(a=>a.type==="dimension").map(a=>a.label).join(",")'),'380,305');
  assert.equal(run('validPlan(exportPlanDocument().plan)'),true);
});


test('old bathroom layouts receive one freely movable toilet and a fixed drain opening',async()=>{
  const base=app();await base.run(`switchPlan('bathroom-1800-1700')`);
  assert.equal(base.run('activePlan.bathroomSpec.toiletRotation'),270);
  assert.equal(base.run('state.furniture.find(f=>f.type==="toilet").w'),366);
  assert.equal(base.run('state.furniture.find(f=>f.type==="toilet").d'),700);
  base.run(`const old=copyData(state);old.planRevision=3;old.furniture=old.furniture.filter(f=>f.type!=='toilet');old.rooms.bathroom.name='保留名称';localStorage.setItem(STORE,JSON.stringify(old));`);
  const reopened=app(Object.fromEntries(base.storage));
  assert.equal(reopened.run('state.furniture.filter(f=>f.type==="toilet").length'),1);
  assert.equal(reopened.run('state.rooms.bathroom.name'),'保留名称');
  assert.equal(reopened.run('state.planRevision'),reopened.run('activePlan.revision'));
  reopened.run(`const f=state.furniture.find(f=>f.type==='toilet');f.cx=900;f.cy=1400;f.rot=90;save();`);
  const moved=app(Object.fromEntries(reopened.storage));
  assert.equal(moved.run('state.furniture.find(f=>f.type==="toilet").cx'),900);
  assert.equal(moved.run('state.furniture.find(f=>f.type==="toilet").rot'),90);
  assert.equal(moved.run('activePlan.pipes[0].cx'),370);
  assert.equal(moved.run('activePlan.pipes[0].cy'),1180);
  assert.equal(moved.run('activePlan.pipes[0].cx-activePlan.pipes[0].outerDiameter/2'),305);
  assert.equal(moved.run('activePlan.pipes[0].height'),0);
  assert.equal(moved.run('activePlan.annotations.some(a=>a.type==="line" || a.type==="point")'),false);
  assert.equal(moved.run('activePlan.annotations.some(a=>a.label.includes("水箱朝左"))'),false);
});

test('800 × 400 floor tiles start at the doorway and continue across cuts at the curb',async()=>{
  const {run}=app();await run(`switchPlan('bathroom-1800-1700')`);
  assert.equal(run('state.rooms.bathroom.mat'),'tile800x400');
  const cells=JSON.parse(run('JSON.stringify(tileCells(activePlan.floorLayout))'));
  assert.equal(cells.length,18);
  assert.equal(cells.reduce((a,t)=>a+t.w*t.h,0),1700*(1800-70));
  assert.ok(cells.every(t=>t.w<=800 && t.h<=400));
  assert.deepEqual([...new Set(cells.map(t=>t.x))],[0,100,900]);
  assert.deepEqual([...new Set(cells.map(t=>t.y))],[0,200,600,800,1000,1400]);
  assert.ok(cells.every(t=>t.y+t.h<=730 || t.y>=800));
  // Distance from the doorway to every uncut interior joint is a multiple of 400 mm.
  const boundaries=[...new Set(cells.flatMap(t=>[t.y,t.y+t.h]))];
  assert.ok(boundaries.filter(y=>![0,730,800].includes(y)).every(y=>(1800-y)%400===0));
  assert.equal(cells.find(t=>t.y+t.h===1800).h,400);
  assert.equal(cells.find(t=>t.y===800).h,200);
  assert.equal(cells.find(t=>t.y+t.h===730).h,130);
  assert.equal(run('activePlan.wallTiles.xOffset'),100);
  assert.equal(run('state.furniture.find(f=>f.type==="shower").tiledFloor'),true);
  assert.equal(run('validPlan(activePlan)'),true);
  assert.equal(run('validPlan({...activePlan,floorLayout:{...activePlan.floorLayout,columns:[800,800]}})'),false);
  assert.equal(run('validPlan({...activePlan,floorLayout:{...activePlan.floorLayout,zones:[{y:0,rows:[800]}]}})'),false);
});

test('new bathroom tiles migrate old saves while preserving toilet edits and later material choices',async()=>{
  const base=app();await base.run(`switchPlan('bathroom-1800-1700')`);
  base.run(`state.planRevision=4;state.rooms.bathroom.mat='antislip';state.rooms.bathroom.name='我的卫生间';
    const toilet=state.furniture.find(f=>f.type==='toilet');Object.assign(toilet,{cx:900,cy:1420,rot:90,w:380,d:720});
    delete state.furniture.find(f=>f.type==='shower').tiledFloor;save();`);
  const updated=app(Object.fromEntries(base.storage));
  assert.equal(updated.run('state.rooms.bathroom.mat'),'tile800x400');
  assert.equal(updated.run('state.rooms.bathroom.name'),'我的卫生间');
  assert.equal(updated.run('state.furniture.find(f=>f.type==="shower").tiledFloor'),true);
  assert.equal(updated.run('["cx","cy","rot","w","d"].map(k=>state.furniture.find(f=>f.type==="toilet")[k]).join(",")'),'900,1420,90,380,720');
  updated.run(`state.rooms.bathroom.mat='marble';save();`);
  const reopened=app(Object.fromEntries(updated.storage));
  assert.equal(reopened.run('state.rooms.bathroom.mat'),'marble');
});

test('imported custom tile cuts stay in an independent layout and survive saving',async()=>{
  const {run,storage}=app();await run(`switchPlan('bathroom-1800-1700')`);
  run(`const doc=exportPlanDocument();doc.plan.floorLayout.columns=[800,800,100];`);
  await run('importPlanDocument(doc)');
  assert.notEqual(run('PLAN_ID'),'bathroom-1800-1700');
  assert.equal(run('activePlan.floorLayout.columns.join(",")'),'800,800,100');
  assert.equal(run(`findPlan('bathroom-1800-1700').floorLayout.columns.join(',')`),'100,800,800');
  const reopened=app(Object.fromEntries(storage));
  assert.equal(reopened.run('activePlan.floorLayout.columns.join(",")'),'800,800,100');
});

test('previous bathroom saves gain one washbasin while keeping existing furniture edits',async()=>{
  const base=app();await base.run(`switchPlan('bathroom-1800-1700')`);
  base.run(`state.planRevision=6;state.furniture=state.furniture.filter(f=>f.type!=='vanity');
    Object.assign(state.furniture.find(f=>f.type==='shower'),{d:700,cy:350});
    Object.assign(state.furniture.find(f=>f.type==='toilet'),{cx:820,cy:1200,rot:90});save();`);
  const updated=app(Object.fromEntries(base.storage));
  assert.equal(updated.run('state.furniture.filter(f=>f.type==="vanity").length'),1);
  assert.equal(updated.run('state.furniture.find(f=>f.type==="toilet").cx'),820);
  assert.equal(updated.run('state.furniture.find(f=>f.type==="shower").d'),730);
  assert.equal(updated.run('state.furniture.find(f=>f.type==="shower").cy'),365);
  updated.run(`state.furniture.find(f=>f.type==='vanity').cx=300;save();`);
  const reopened=app(Object.fromEntries(updated.storage));
  assert.equal(reopened.run('state.furniture.filter(f=>f.type==="vanity").length'),1);
  assert.equal(reopened.run('state.furniture.find(f=>f.type==="vanity").cx'),300);
  reopened.run(`state.furniture=state.furniture.filter(f=>f.type!=='vanity');save();`);
  const removed=app(Object.fromEntries(reopened.storage));
  assert.equal(removed.run('state.furniture.some(f=>f.type==="vanity")'),false);
});

test('saved bathroom washbasins become full rectangular basins without resetting placement or dimensions',async()=>{
  const first=app();await first.run(`switchPlan('bathroom-1800-1700')`);
  first.run(`state.planRevision=12;const basin=state.furniture.find(f=>f.type==='vanity');
    delete basin.basinStyle;Object.assign(basin,{cx:320,cy:1500,w:340,d:520,rot:180});save();`);
  const updated=app(Object.fromEntries(first.storage));
  assert.equal(updated.run(`state.furniture.find(f=>f.type==='vanity').basinStyle`),'full-rect');
  assert.equal(updated.run(`(()=>{const f=state.furniture.find(f=>f.type==='vanity');return [f.cx,f.cy,f.w,f.d,f.rot].join(',');})()`),'320,1500,340,520,180');
  assert.equal(updated.run(`exportPlanDocument().state.furniture.find(f=>f.type==='vanity').basinStyle`),'full-rect');
  assert.equal(updated.run(`findPlan('original').furniture.some(f=>f.basinStyle==='full-rect')`),false);
  const snapshot=JSON.parse(fs.readFileSync(path.join(__dirname,'../floorplans/bathroom-1800-1700.json'),'utf8'));
  assert.equal(snapshot.plan.furniture.find(f=>f.type==='vanity').basinStyle,'full-rect');
  assert.equal(snapshot.state.furniture.find(f=>f.type==='vanity').basinStyle,'full-rect');
});

const scanFixture=JSON.parse(fs.readFileSync(path.join(__dirname,'../ios/Fixtures/demo-scan.json'),'utf8'));
test('iOS scan imports into an editable layout with metric dimensions and real door/window gaps',async()=>{
  const {run,storage}=app();
  assert.equal(await run(`importPlanDocument(${JSON.stringify(scanFixture)})`),true);
  assert.equal(run('PLAN_ID'),'scan-'+scanFixture.id);
  assert.equal(run('validPlan(activePlan)'),true);
  assert.equal(run('area(ROOMS[0].poly)'),12);
  assert.equal(run('CEILING_HEIGHT'),2.8);
  assert.equal(run('WINS[0].sill'),1);
  assert.equal(run('Math.abs(WINS[0].head-2.2)<1e-9'),true);
  assert.equal(run('DOORS[0].len'),800);
  assert.equal(run('DOORS[0].height'),2);
  assert.equal(run('DOORS[0].o[1]'),-1);
  assert.equal(run('WALLS.some(w=>pointInPoly(2000,0,wallPoly(w)))'),false);
  assert.equal(run('WALLS.some(w=>pointInPoly(3400,3000,wallPoly(w)))'),false);
  assert.equal(run('state.furniture[0].w'),2000);
  assert.equal(run('state.furniture[0].d'),800);
  assert.equal(run('state.furniture[0].scanHeight'),800);
  assert.equal(run('state.furniture[0].cy'),1500);
  assert.equal(run('activePlan.unverified'),true);
  const reopened=app(Object.fromEntries(storage));
  assert.equal(reopened.run('PLAN_ID'),'scan-'+scanFixture.id);
  assert.equal(reopened.run('state.furniture[0].w'),2000);
});

test('iOS scan conversion preserves concave floors, rotated objects and elevated objects',()=>{
  const {run}=app();const scan=structuredClone(scanFixture);
  scan.floors[0].corners=[[0,0,0],[4,0,0],[4,0,1],[2,0,1],[2,0,3],[0,0,3]];
  scan.objects[0].xAxis=[0,0,1];scan.objects[0].center[1]=1;
  run(`const converted=convertScanDocument(${JSON.stringify(scan)});`);
  assert.equal(run('area(converted.plan.rooms[0].poly)'),8);
  assert.equal(run('converted.state.furniture[0].rot'),90);
  assert.equal(run('converted.state.furniture[0].scanElevation'),600);
});

test('malformed or incomplete iOS scans never overwrite the current layout',async()=>{
  const {run}=app();run('state.furniture[0].cx=8765;');
  for(const change of [s=>s.units='mm',s=>s.floors=[],s=>s.objects[0].size[0]=-1,
    s=>s.surfaces[4].center=[100,1.6,100],s=>s.surfaces.push({...s.surfaces[4],id:'overlap'}),
    s=>s.surfaces[0].xAxis=[0,0,0]]){
    const invalid=structuredClone(scanFixture);change(invalid);
    await assert.rejects(()=>run(`importPlanDocument(${JSON.stringify(invalid)})`));
    assert.equal(run('PLAN_ID'),'img-0914');assert.equal(run('state.furniture[0].cx'),8765);
  }
});
