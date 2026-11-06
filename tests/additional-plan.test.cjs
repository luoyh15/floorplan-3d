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


const addedDocument=JSON.parse(fs.readFileSync(path.join(__dirname,'../floorplans/demolition-preview.json'),'utf8'));
const addedID=addedDocument.plan.id;
const plain=value=>JSON.parse(JSON.stringify(value));

test('additional built-in preserves the uploaded geometry and complete saved arrangement',async()=>{
  const {run}=app();
  assert.equal(run(`validPlan(findPlan('${addedID}'))`),true);
  assert.deepEqual(JSON.parse(run(`JSON.stringify(findPlan('${addedID}'))`)),addedDocument.plan);
  assert.equal(await run(`switchPlan('${addedID}')`),true);
  const saved=JSON.parse(run('JSON.stringify(exportPlanDocument().state)'));
  for(const key of Object.keys(addedDocument.state)) assert.deepEqual(saved[key],plain(addedDocument.state[key]));
  assert.equal(saved.furniture.length,71);
  assert.equal(saved.demolished.length,8);
  assert.equal(run('state.rooms.BATH_B.mat'),'tile800x400');
  assert.equal(run('state.rooms.KITCHEN.mat'),'tile800');
  assert.equal(run('CEILING_HEIGHT'),3.3);
});

test('additional layout saves independently, restores edits, and keeps an immutable reset baseline',async()=>{
  const first=app();first.run('state.furniture[0].cx=12345;');
  await first.run(`switchPlan('${addedID}')`);
  first.run("state.furniture[0].cx=9876;state.demolished.pop();state.rooms.BATH_B.mat='marble';save();");
  await first.run("switchPlan('img-0914')");
  assert.equal(first.run('state.furniture[0].cx'),12345);
  await first.run(`switchPlan('${addedID}')`);
  const reopened=app(Object.fromEntries(first.storage));
  assert.equal(reopened.run('PLAN_ID'),addedID);
  assert.equal(reopened.run('state.furniture[0].cx'),9876);
  assert.equal(reopened.run('state.demolished.length'),7);
  assert.equal(reopened.run('state.rooms.BATH_B.mat'),'marble');
  const defaults=JSON.parse(reopened.run('JSON.stringify(defaultState())'));
  for(const key of Object.keys(addedDocument.state)) assert.deepEqual(defaults[key],plain(addedDocument.state[key]));
  reopened.run('state=defaultState();state.furniture[0].cx=3333;state.demolished.length=0;');
  assert.equal(reopened.run('defaultState().demolished.length'),8);
  assert.equal(reopened.run('defaultState().furniture[0].cx'),addedDocument.state.furniture[0].cx);
});

test('an already-imported copy remains a single selectable layout with its existing edits',()=>{
  const key='huxing-design-'+addedID+'-v1',saved=structuredClone(addedDocument.state);
  saved.furniture[0].cx=5432;
  const {run}=app({'huxing-custom-plans-v1':JSON.stringify([addedDocument.plan]),
    'huxing-active-plan-v1':addedID,[key]:JSON.stringify(saved)});
  assert.equal(run(`allPlans().filter(p=>p.id==='${addedID}').length`),1);
  assert.equal(run('state.furniture[0].cx'),5432);
});
