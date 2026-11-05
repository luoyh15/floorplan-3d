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
    setTimeout,clearTimeout,
    localStorage:{getItem:k=>storage.get(k)||null,removeItem:k=>storage.delete(k),setItem:(k,v)=>{if(storageFails) throw Error('Storage full');storage.set(k,v);}},
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

test('replacement home discards the retired built-in save without mixing furniture into the new plan',()=>{
  const oldKey='huxing-design-img-0914-v1',snapshotKey='huxing-snapshot-img-0914-v1';
  const old={planId:'img-0914',furniture:[{id:'old-bed',type:'bed',name:'旧家具',cx:999999,cy:999999,w:1800,d:2000,rot:0,color:'#ffffff'}]};
  const {run,storage}=app({[oldKey]:JSON.stringify(old),[snapshotKey]:JSON.stringify({plan:{id:'img-0914'}})});
  assert.equal(storage.has(oldKey),false);
  assert.equal(storage.has(snapshotKey),false);
  assert.equal(run('state.furniture.some(f=>f.name==="旧家具")'),false);
  assert.equal(run('activePlan.revision'),2);
  assert.equal(run('activePlan.rooms.filter(r=>r.name.includes("卫浴")).length'),4);
  run('state.furniture[0].cx=8888;save();');
  const reopened=app(Object.fromEntries(storage));
  assert.equal(reopened.run('state.furniture[0].cx'),8888);
});

test('replacement JSON exactly matches the built-in geometry and includes the kitchen bath, vestibule and continuous south curve',()=>{
  const {run}=app(),doc=JSON.parse(fs.readFileSync(path.join(__dirname,'../floorplans/img-0914.json'),'utf8'));
  for(const key of ['walls','windows','doors','slides','rooms','furniture','dimensions','entry','lintels','notes'])
    assert.deepEqual(JSON.parse(run('JSON.stringify(activePlan.'+key+')')),JSON.parse(JSON.stringify(doc.plan[key])));
  assert.equal(run('validPlan(activePlan)'),true);
  assert.equal(run('ROOMS.some(r=>r.id==="master-balcony")'),false);
  for(const id of ['kitchen-bath','laundry','entry','balcony']) assert.equal(run(`ROOMS.some(r=>r.id==='${id}')`),true);
  assert.equal(run('DOORS.filter(d=>d.entry).length'),2);
  assert.equal(run('DOORS.filter(d=>d.name.includes("玄关内门")).length'),2);
  assert.equal(run('WINS.filter(w=>w.a[1]>14000 && w.b[1]>14000).length>20'),true);
});
