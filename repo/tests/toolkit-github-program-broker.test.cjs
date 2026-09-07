'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const cp=require('node:child_process');const test=require('node:test');
const {canonicalSerialize,digestValue}=require('../scripts/toolkit-execution-loop.cjs');
const receipt=require('../scripts/toolkit-github-program-receipt.cjs');
const root=path.resolve(__dirname,'../..');const manifest=path.join(root,'repo/scripts/github-program-broker/Cargo.toml');
const fixture=JSON.parse(fs.readFileSync(path.join(root,'repo/scripts/github-program-broker/tests/fixtures/source-slice-1-vectors.json')));
// Test-owned dependencies and compiler outputs stay outside the checkout, including
// generic CI jobs which do not configure broker-specific tools.
const ownedTemporaryRoots=[];
function temporaryRoot(label){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'toolkit-lock007-'+label+'-'));ownedTemporaryRoots.push(dir);return dir;}
const cargoTarget=process.env.CARGO_TARGET_DIR||temporaryRoot('build');
let schemaPython=process.env.BROKER_SCHEMA_PYTHON;
function schemaInterpreter(){
 if(schemaPython)return schemaPython;
 if(process.env.CI!=='true')return 'python';
 const environment=temporaryRoot('schema');
 run('python',['-m','venv',environment]);
 schemaPython=path.join(environment,process.platform==='win32'?'Scripts/python.exe':'bin/python');
 run(schemaPython,['-m','pip','--isolated','install','--disable-pip-version-check','--no-input','--quiet','--index-url','https://pypi.org/simple','jsonschema==4.26.0','referencing==0.37.0','attrs==26.1.0','jsonschema-specifications==2025.9.1','rpds-py==2026.6.3','typing-extensions==4.16.0']);
 console.log('LOCK007_SCHEMA_ORACLE=jsonschema==4.26.0 isolated CI environment');
 return schemaPython;
}
test.after(()=>{for(const dir of ownedTemporaryRoots){assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('toolkit-lock007-'));fs.rmSync(dir,{recursive:true,force:true});}});

function run(command,args,options={}){const r=cp.spawnSync(command,args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:300000,maxBuffer:16*1024*1024,...options});assert.equal(r.status,0,`${command}: ${r.error?.message||''}\n${r.stdout}\n${r.stderr}`);return r.stdout;}
function oracle(rows,release=false){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'toolkit-lock007-oracle-'));const input=path.join(dir,'cases.json');try{fs.writeFileSync(input,JSON.stringify(rows));const output=run('cargo',['+1.98.0','test','--locked','--manifest-path',manifest,...(release?['--release']:[]),'--test','contracts','external_oracle','--','--ignored','--exact','--nocapture'],{env:{...process.env,CARGO_TARGET_DIR:cargoTarget,BROKER_ORACLE_INPUT:input}});const match=output.match(/^ORACLE_JSON=([^\r\n]+)$/m);assert.ok(match,'Rust oracle output missing');return JSON.parse(match[1]);}finally{fs.unlinkSync(input);fs.rmdirSync(dir);}}
const raw=(mode,v,request)=>({mode,raw:canonicalSerialize(v),...(request?{request}:{})});
const copy=structuredClone;
function rehash(v){if(v.result?.value && Object.hasOwn(v.result,"result_digest")){v.result.result_digest=digestValue(Object.fromEntries(["operation","value"].filter(k=>Object.hasOwn(v.result,k)).map(k=>[k,v.result[k]])));}return v;}
function schemaResults(rows){const code=String.raw`
import json,sys,pathlib
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8")
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
from urllib.parse import urljoin
folder=pathlib.Path('repo/contracts/github-program-receipt')
base='https://toolkit.invalid/'
docs={p.name:json.loads(p.read_text(encoding='utf-8-sig')) for p in folder.glob('*.schema.json')}
ids={d.get('$id'):base+n for n,d in docs.items()}
def scoped(x,uri):
 if isinstance(x,list):return [scoped(v,uri) for v in x]
 if not isinstance(x,dict):return x
 return {k:(uri if k=='$id' else ids.get(v,urljoin(uri,v)) if k=='$ref' else scoped(v,uri)) for k,v in x.items()}
registry=Registry().with_resources([(base+n,Resource.from_contents(scoped(d,base+n))) for n,d in docs.items()])
uri=base+'broker-ipc-v1.schema.json'
validators={m:Draft202012Validator({'$ref':uri+('' if m=='request' else '#/$defs/brokerHolder' if m=='holder' else '#/$defs/response')},registry=registry) for m in ['request','response','holder']}
print(json.dumps([validators[r['mode']].is_valid(json.loads(r['raw'])) for r in json.load(sys.stdin)]))
`;return JSON.parse(run(schemaInterpreter(),['-W','ignore::DeprecationWarning','-c',code],{input:JSON.stringify(rows)}));}
test('same raw envelopes through standard JSON Schema, Rust decoder and request-bound production decoder',()=>{
 const rows=[];const expected=[];const add=(mode,v,valid,request)=>{rows.push(raw(mode,v,request));expected.push(valid);};
 for(const request of fixture.requests){add('request',request,true);for(const key of Object.keys(request)){const v=copy(request);delete v[key];add('request',v,false);}for(const key of Object.keys(request.operation)){const v=copy(request);delete v.operation[key];add('request',v,false);}}
 for(let i=0;i<11;i++){const s=fixture.responses[i];const request=fixture.requests[i];add('response',s,true,request);
  for(const key of Object.keys(s)){const v=copy(s);delete v[key];add('response',v,false,request);}
  for(const key of Object.keys(s.result)){const v=copy(s);delete v.result[key];add('response',rehash(v),false,request);}
  for(const key of Object.keys(s.result.value)){const v=copy(s);delete v.result.value[key];add('response',rehash(v),false,request);}
  const extra=copy(s);extra.result.value.extra='unexpected';add('response',rehash(extra),false,request);
  const stub=copy(s);stub.result.value={kind:s.result.operation,state_digest:'a'.repeat(64)};add('response',rehash(stub),false,request);
  const nil=copy(s);nil.result=null;add('response',nil,false,request);
  const wrongOperation=copy(s);wrongOperation.result.operation=fixture.responses[(i+1)%11].result.operation;add('response',rehash(wrongOperation),false,request);
  if(i===0){const wrongNested=copy(s);wrongNested.result.value.target='RUN';add('response',rehash(wrongNested),false,request);}

 }
 const failure={schema:fixture.schema,request_id:null,ok:false,result:null,error:{code:'BROKER_MALFORMED_REQUEST'}};add('response',failure,true);
 for(const key of Object.keys(failure)){const v=copy(failure);delete v[key];add('response',v,false);}
 assert.deepEqual(schemaResults(rows),expected,'independent JSON Schema classifications');
 for(const release of [false,true]){const got=oracle(rows,release);for(let i=0;i<rows.length;i++){assert.equal(got[i].valid,expected[i],`raw parity ${i}`);if(rows[i].request)assert.equal(got[i].bound,expected[i],`bound parity ${i}`);}}
});
test('all 11 typed operations, all 5 readback branches, canonical receipt validators and 110 wrong-operation results',()=>{
 const rows=[];const expected=[];
 for(let i=0;i<11;i++)for(let j=0;j<11;j++){rows.push(raw('response',fixture.responses[j],fixture.requests[i]));expected.push(i===j);}
 for(const readback of fixture.readbacks){const s=copy(fixture.responses[0]);s.result.value={kind:'READBACK_INSPECTION',target:readback.kind,readback};const request=copy(fixture.requests[0]);request.operation.target=readback.kind;rows.push(raw('response',rehash(s),request));expected.push(true);}
 const got=oracle(rows);for(let i=0;i<rows.length;i++){assert.equal(got[i].valid,true,`independent response validity ${i}`);assert.equal(got[i].bound,expected[i],`operation binding ${i}`);}
 receipt.validateReceiptChain(fixture.readbacks[2].receipts);receipt.validateRecoveryRecord(fixture.responses[9].result.value.recovery_record);receipt.validateHolderAttestation(fixture.holder);
});
test('receipt and mutation invariant forgeries fail independently after inner and outer rehashing',()=>{
 const cases=[];
 const hashWithout=(v,k)=>{const p={...v};delete p[k];v[k]=digestValue(p);};
 function chainHashes(v,link=true){v.receipts.forEach((r,i)=>{if(link && i)r.prior_receipt_id=v.receipts[i-1].receipt_id;hashWithout(r,'receipt_id');});v.chain_digest=digestValue(v.receipts);}
 function operationHash(o){const row={...o,lock_id:o.lock,source_digest:o.expected_source_digest,target_identity_json:canonicalSerialize(o.target_identity)};for(const k of ['operation_digest','lock','expected_source_digest','target_identity'])delete row[k];o.operation_digest=digestValue(row);}
 function add(readback){const s=copy(fixture.responses[0]);s.result.value={kind:'READBACK_INSPECTION',target:readback.kind,readback};cases.push(raw('response',rehash(s)));}
 const chain=fixture.readbacks[2];
 for(const mutate of [
  v=>v.receipts[1].run_id='wrong-run',
  v=>v.receipts[1].authority.scope_digest='b'.repeat(64),
  v=>v.receipts[1].sequence=3,
  v=>v.receipts[0].created_at='2026-09-06T00:00:01.000Z',
  v=>{const r=copy(v.receipts[1]);r.sequence=3;v.receipts.push(r);},
  v=>{v.receipts[1].candidate={pr_number:3,branch:'example/repair',base_ref:'main',base_sha:'1'.repeat(40),head_sha:'1'.repeat(40),tree_sha:'1'.repeat(40)};},
  v=>{v.receipts[1].receipt_type='TRANSITION_PREVIEW';v.receipts[1].candidate={pr_number:3,branch:'example/repair',base_ref:'main',base_sha:'1'.repeat(40),head_sha:'1'.repeat(40),tree_sha:'1'.repeat(40)};const r=copy(v.receipts[1]);r.sequence=3;r.candidate.head_sha='2'.repeat(40);v.receipts.push(r);}
 ]){const v=copy(chain);mutate(v);chainHashes(v);assert.throws(()=>receipt.validateReceiptChain(v.receipts));add(v);}
 const broken=copy(chain);broken.receipts[1].prior_receipt_id='b'.repeat(64);chainHashes(broken,false);add(broken);
 const mutation=fixture.readbacks[3];
 for(const mutate of [v=>v.operation.logical_operation_digest='b'.repeat(64),v=>v.operation.provider_operation_key='gpr:wrong',v=>v.operation.target_digest='b'.repeat(64)]){const v=copy(mutation);mutate(v);operationHash(v.operation);add(v);}
 for(const mutate of [v=>v.events[1].operation_id='wrong',v=>v.events[1].sequence=3,v=>v.events[1].prior_event_id='wrong',v=>v.events[1].event_at='2026-09-05T23:59:59.000Z',v=>v.events[0].state='APPLIED',v=>{v.events[1].state='APPLIED';v.state='APPLIED';},v=>v.state='UNKNOWN']){const v=copy(mutation);mutate(v);v.events.forEach(e=>hashWithout(e,'event_digest'));add(v);}
 for(const mutate of [v=>v.operation.operation_digest='b'.repeat(64),v=>v.events[1].event_digest='b'.repeat(64)]){const v=copy(mutation);mutate(v);add(v);}
 for(const release of [false,true]){const got=oracle(cases,release);for(let i=0;i<got.length;i++)assert.equal(got[i].valid,false,`isolated integrity forgery ${i}`);}
});

test('every nested required field and closed object rejects omission or addition on raw schema and Rust paths',()=>{
 const rows=[];
 function objects(v,trail=[]){if(!v || typeof v!=='object')return [];if(Array.isArray(v))return v.flatMap((x,i)=>objects(x,[...trail,i]));return [trail,...Object.keys(v).flatMap(k=>objects(v[k],[...trail,k]))];}
 for(const [mode,values] of [['request',fixture.requests],['response',fixture.responses]])for(const original of values){
  for(const trail of objects(original)){
   const target=trail.reduce((v,k)=>v[k],original);
   for(const key of [...Object.keys(target),'__extra']){const v=copy(original);const o=trail.reduce((v,k)=>v[k],v);if(key==='__extra')o[key]='unexpected';else delete o[key];rows.push(raw(mode,mode==='response'?rehash(v):v));}
  }
 }
 assert.ok(schemaResults(rows).every(x=>!x),'all fixture object fields are required and all objects closed');
 for(const release of [false,true]){const got=oracle(rows,release);for(let i=0;i<got.length;i++)assert.equal(got[i].valid,false,`nested raw ${i}`);}
 console.log(`LOCK007_NESTED_REQUIRED_CLOSED_PARITY=${rows.length} debug+release PASS`);
});

test('independent JavaScript canonical scalar differential over deterministic binary64 values and Unicode boundaries',()=>{
 const values=[0,-0,621984972275886.2,Number.MIN_VALUE,Number.MAX_VALUE,Number.EPSILON,1e-7,1e-6,1e20,1e21,Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER+1,-Number.MAX_SAFE_INTEGER];
 let state=0x123456789abcdef0n;const bytes=Buffer.alloc(8);for(let i=0;i<12000;i++){state=BigInt.asUintN(64,state^(state<<13n));state=BigInt.asUintN(64,state^(state>>7n));state=BigInt.asUintN(64,state^(state<<17n));bytes.writeBigUInt64LE(state);const n=bytes.readDoubleLE();if(Number.isFinite(n))values.push(n);}
 for(let i=0;i<256;i++)values.push(String.fromCharCode(i));values.push('"/\\','a\u0301','\uD800','\uDC00','\uD83D\uDE00','\uFFFF','\u{10000}','\u2028\u2029');
 const rows=values.map(v=>({mode:'scalar',raw:JSON.stringify(v)}));rows.push({mode:'scalar',raw:'-0'});
 for(const release of [false,true]){const got=oracle(rows,release);for(let i=0;i<rows.length;i++)assert.equal(got[i].canonical,JSON.stringify(JSON.parse(rows[i].raw)),`scalar ${i}: ${rows[i].raw}`);}
 console.log(`LOCK007_JS_SCALAR_DIFFERENTIAL=${rows.length} debug+release PASS`);
});
test('pre-ID and late-failure ownership uses raw canonical input including duplicate aliases and lone surrogates',()=>{
 const id=fixture.request_id;const req=fixture.requests[0];const rows=[];const want=[];function add(s,owned){rows.push({mode:'request',raw:s});want.push(owned?id:null);}
 add('{}',false);add('{"request_id":"bad"}',false);add('{"operation":{"kind":0}}',false);
 for(const v of [0,null,{}, {kind:'unknown'}, {kind:'READBACK_INSPECTION',target:7}])add(canonicalSerialize({...req,operation:v}),true);
 for(const surrogate of ['\\ud800','\\udc00'])add(canonicalSerialize(req).replace('NAMESPACE',surrogate),true);
 const canonicalRequest=canonicalSerialize(req);assert.equal(canonicalRequest[0],'{');
 // Insert one deliberate duplicate top-level key; this is fixture construction, not escaping.
 const requestMembers=canonicalRequest.slice(1);
 add('{"request_id":"'+id+'",'+requestMembers,false);add('{"request_\\u0069d":"'+id+'",'+requestMembers,false);add(' '+canonicalRequest,false);
 const got=oracle(rows);for(let i=0;i<rows.length;i++){assert.equal(got[i].valid,false);assert.equal(got[i].request_id,want[i],`ownership ${i}`);}
});
module.exports={oracle,schemaResults};


test('independent Node crypto oracle verifies domain-separated identity, holder tag and attestation digests',()=>{
 const rows=[];const expected=[];const d='a'.repeat(64),e='b'.repeat(64);
 function add(v,input){rows.push({mode:'identity',raw:JSON.stringify(v)});expected.push(digestValue(input));}
 for(const platform of ['windows','linux']){
  add({kind:'broker',platform,executable:d,service:'service-test'},{schema:'toolkit.github-program.broker-identity.v1',platform,protocol:fixture.schema,executable_sha256:d,service_identity:'service-test'});
  add({kind:'boot',platform,identity:'boot-test'},['toolkit.github-program.boot-identity.v1',platform,'boot-test']);
  add({kind:'pid_namespace',platform,identity:'namespace-test'},['toolkit.github-program.pid-namespace-identity.v1',platform,'namespace-test']);
 }
 add({kind:'windows_principal',sid:'S-1-5-21-1'},['toolkit.github-program.principal.v1','windows','S-1-5-21-1']);
 add({kind:'linux_principal',machine_id:'1'.repeat(32),uid:1000},['toolkit.github-program.principal.v1','linux',{machine_id:'1'.repeat(32),uid:'1000'}]);
 add({kind:'store',namespace:d,store:e},['toolkit.github-program.store-binding.v1',d,e]);
 add({kind:'path',store:d,path:e},['toolkit.github-program.path-binding.v1',d,e]);
 for(const release of [false,true])assert.deepEqual(oracle(rows,release).map(x=>x.digest),expected);
 const holder=copy(fixture.holder);delete holder.attestation_tag;delete holder.attestation_digest;
 const payload=Buffer.concat([Buffer.from('toolkit.github-program.holder-attestation-tag.v1\0'),Buffer.from(canonicalSerialize(holder))]);
 assert.equal(require('node:crypto').createHmac('sha256',Buffer.alloc(32,11)).update(payload).digest('hex'),fixture.holder.attestation_tag);
 holder.attestation_tag=fixture.holder.attestation_tag;assert.equal(digestValue(holder),fixture.holder.attestation_digest);
});


test('accepted target identifier size boundary agrees with schema and authority validator',()=>{
 const rows=[];const expected=[];
 for(const size of [159,160,161,511,512,513]){const v=copy(fixture.requests[5]);v.operation.descriptor.target_identity.resource_id='x'.repeat(size);v.operation.descriptor.target_digest=digestValue(v.operation.descriptor.target_identity);rows.push(raw('request',v));expected.push(size<=512);if(size<=512)receipt.validateOperationDescriptor(v.operation.descriptor);else assert.throws(()=>receipt.validateOperationDescriptor(v.operation.descriptor));}
 assert.deepEqual(schemaResults(rows),expected);assert.deepEqual(oracle(rows).map(x=>x.valid),expected);
});


test('raw request lexical identifiers cannot gain a trailing newline through regex end-anchor semantics',()=>{
 const rows=[];
 for(const field of ['request_id','lock'])for(const suffix of ['\n','\r','\r\n','\u2028']){const v=copy(fixture.requests[0]);v[field]+=suffix;rows.push(raw('request',v));}
 const v=copy(fixture.requests[0]);v.expected.state_digest='a'.repeat(64)+'\n';rows.push(raw('request',v));
 assert.ok(schemaResults(rows).every(x=>!x));
 const got=oracle(rows);assert.ok(got.every(x=>!x.valid));
 for(let i=0;i<4;i++)assert.equal(got[i].request_id,null);
 for(let i=4;i<got.length;i++)assert.equal(got[i].request_id,fixture.request_id);
});


test('standard schema date-time assertions and Rust Gregorian validation agree on raw requests',()=>{
 const rows=[];const expected=[];
 for(const [timestamp,valid] of [['2024-02-29T00:00:00.000Z',true],['2026-02-28T23:59:59.999Z',true],['2026-02-29T00:00:00.000Z',false],['2026-02-30T00:00:00.000Z',false],['2026-13-01T00:00:00.000Z',false],['2026-01-01T24:00:00.000Z',false]]){const v=copy(fixture.requests[1]);v.operation.authority.updated_at=timestamp;rows.push(raw('request',v));expected.push(valid);}
 assert.deepEqual(schemaResults(rows),expected);
 for(const release of [false,true])assert.deepEqual(oracle(rows,release).map(x=>x.valid),expected);
});

// Lock-008 graph coverage is derived from the accepted schema graph, not fixture key counts.
const lock008ExecutedIds = new Set();
function recordLock008(ids) { for (const id of ids) { assert.ok(fixture.lock008.vectors[id], id); lock008ExecutedIds.add(id); } }

function lock008Witnesses() {
 const contract=fixture.lock008;
 const documents=Object.fromEntries(Object.entries(contract.original_schemas).map(([name,d])=>[name,d.schema]));
 const ids=Object.fromEntries(Object.entries(documents).map(([name,d])=>[d.$id,name]));
 const witnesses=new Map();const occurrences=new Map();
 const pointer=(d,p)=>p.split('/').slice(1).reduce((v,k)=>v[k.replace(/~1/g,'/').replace(/~0/g,'~')],d);
 const compatible=(s,v)=>{
  if(!s||typeof s!=='object')return true;
  if(Object.hasOwn(s,'const')&&JSON.stringify(s.const)!==JSON.stringify(v))return false;
  if(s.type==='null')return v===null;
  if(s.type==='object'&&(!v||typeof v!=='object'||Array.isArray(v)))return false;
  if(s.type==='string'&&typeof v!=='string')return false;
  if(s.properties&&v&&typeof v==='object')for(const [k,x]of Object.entries(s.properties))if(Object.hasOwn(x,'const')&&Object.hasOwn(v,k)&&JSON.stringify(v[k])!==JSON.stringify(x.const))return false;
  return true;
 };
 function walk(s,v,doc,sp,trail,rootValue,mode) {
  if(!s||typeof s!=='object')return;
  if(s.$ref){const [base,frag='']=s.$ref.split('#');const target=base?(ids[base]||base):doc;walk(pointer(documents[target],frag),v,target,frag,trail,rootValue,mode);}
  if(s.properties&&v&&typeof v==='object'&&!Array.isArray(v))for(const [key,child]of Object.entries(s.properties)){
   const site=doc+'#'+sp+'/properties/'+key;
   if(Object.hasOwn(v,key)){const witness={mode,value:rootValue,trail:[...trail,key]};if(!witnesses.has(site))witnesses.set(site,witness);if(!occurrences.has(site))occurrences.set(site,[]);const seen=occurrences.get(site);if(!seen.some(x=>x.value===rootValue&&JSON.stringify(x.trail)===JSON.stringify(witness.trail)))seen.push(witness);walk(child,v[key],doc,sp+'/properties/'+key,[...trail,key],rootValue,mode);}
  }
  for(const union of ['oneOf','anyOf'])if(s[union])s[union].forEach((child,i)=>{if(compatible(child,v))walk(child,v,doc,sp+'/'+union+'/'+i,trail,rootValue,mode);});
  if(s.allOf)s.allOf.forEach((child,i)=>walk(child,v,doc,sp+'/allOf/'+i,trail,rootValue,mode));
  for(const key of ['if','then','else'])if(s[key])walk(s[key],v,doc,sp+'/'+key,trail,rootValue,mode);
  if(s.items&&Array.isArray(v))v.forEach((x,i)=>walk(s.items,x,doc,sp+'/items',[...trail,i],rootValue,mode));
 }
 const roots=[];
 for(const value of fixture.requests)roots.push({mode:'request',value});
 for(const value of fixture.responses)roots.push({mode:'response',value});
 for(const readback of fixture.readbacks){const value=copy(fixture.responses[0]);value.result.value={kind:'READBACK_INSPECTION',target:readback.kind,readback};roots.push({mode:'response',value:rehash(value)});}
 roots.push({mode:'holder',value:fixture.holder});
 roots.push({mode:'response',value:{schema:fixture.schema,request_id:null,ok:false,result:null,error:{code:'BROKER_MALFORMED_REQUEST'}}});
 const detached=copy(fixture.requests[1]);detached.operation.start.ref={detached:true,name:null};roots.push({mode:'request',value:detached});
 const complete=copy(fixture.responses[3]);const r=complete.result.value.receipt;
 r.receipt_type='TRANSITION_PREVIEW';r.candidate={pr_number:3,branch:'example/repair',base_ref:'main',base_sha:'1'.repeat(40),head_sha:'1'.repeat(40),tree_sha:'1'.repeat(40)};
 Object.assign(r.payload,{reason_code:'test',outcome_digest:'a'.repeat(64),evidence_digest:'a'.repeat(64),operation_digest:'a'.repeat(64),detail_digest:'a'.repeat(64),mutation_outcome:'KNOWN',evidence_refs:[{id:'test',digest:'a'.repeat(64)}]});
 const payload={...r};delete payload.receipt_id;r.receipt_id=digestValue(payload);roots.push({mode:'response',value:rehash(complete)});
 for(const {mode,value}of roots){const doc=mode==='holder'?'holder-attestation-v1.schema.json':'broker-ipc-v1.schema.json';const sp=mode==='response'?'/$defs/response':'';walk(pointer(documents[doc],sp),value,doc,sp,[],value,mode);}
 return {witnesses,roots,occurrences};
}
test('Lock-008 binds every accepted graph site to a concrete enclosing value',()=>{
 const {witnesses}=lock008Witnesses();
 const missing=fixture.lock008.sites.filter(s=>!witnesses.has(s.site_id)).map(s=>s.site_id);
 assert.deepEqual(missing,[],'no missing field-site witness');
 assert.equal(fixture.lock008.sites.length,390);
 assert.equal(Object.keys(fixture.lock008.canonical_constraints).length,119);
 assert.equal(Object.keys(fixture.lock008.vectors).length,2940);
 console.log('LOCK008_GRAPH_WITNESSES=390');
});

function lock008Repair(value,mode,trail=[]) {
 const protectedParent=trail.slice(0,-1).reduce((v,k)=>v?.[k],value);const protectedKey=trail.at(-1);
 const mutable=(v,k)=>!(v===protectedParent&&k===protectedKey);
 const hashWithout=(v,key)=>{if(Object.hasOwn(v,key)&&mutable(v,key)){const x={...v};delete x[key];v[key]=digestValue(x);}};
 function visit(v){
  if(!v||typeof v!=='object')return;
  if(Array.isArray(v)){v.forEach(visit);return;}
  Object.values(v).forEach(visit);
  if(v.target_identity&&Object.hasOwn(v,'target_digest')&&mutable(v,'target_digest'))v.target_digest=digestValue(v.target_identity);
  if(Object.hasOwn(v,'logical_operation_digest')&&Object.hasOwn(v,'operation_digest')){
   const keys=['operation_kind','safety_class','target_identity','target_digest','expected_post_state_digest','adapter_identity_digest'];
   if(mutable(v,'logical_operation_digest'))v.logical_operation_digest=digestValue(Object.fromEntries(keys.filter(k=>Object.hasOwn(v,k)).map(k=>[k,v[k]])));
   const row={...v};delete row.operation_digest;
   if(Object.hasOwn(row,'lock')){row.lock_id=row.lock;delete row.lock;}
   if(Object.hasOwn(row,'expected_source_digest')){row.source_digest=row.expected_source_digest;delete row.expected_source_digest;}
   if(Object.hasOwn(row,'target_identity')){row.target_identity_json=canonicalSerialize(row.target_identity);delete row.target_identity;}
   if(mutable(v,'operation_digest'))v.operation_digest=digestValue(row);
  }
  if(Object.hasOwn(v,'evidence_at'))hashWithout(v,'evidence_digest');
  if(Object.hasOwn(v,'event_digest'))hashWithout(v,'event_digest');
  if(Object.hasOwn(v,'receipt_type'))hashWithout(v,'receipt_id');
  if(v.pre_recovery_evidence&&Object.hasOwn(v,'pre_recovery_evidence_digest')&&mutable(v,'pre_recovery_evidence_digest'))v.pre_recovery_evidence_digest=digestValue(v.pre_recovery_evidence);
  if(Object.hasOwn(v,'recovery_record_digest'))hashWithout(v,'recovery_record_digest');
  if(v.kind==='NAMESPACE'&&v.namespace&&Object.hasOwn(v,'namespace_digest')&&mutable(v,'namespace_digest'))v.namespace_digest=digestValue({schema:'toolkit.github-program.run-receipt.v1',...v.namespace});
  if(v.kind==='RECEIPT_CHAIN'&&Array.isArray(v.receipts)){for(let i=1;i<v.receipts.length;i++){const r=v.receipts[i];if(Object.hasOwn(v.receipts[i-1],'receipt_id')&&Object.hasOwn(r,'prior_receipt_id')&&mutable(r,'prior_receipt_id'))r.prior_receipt_id=v.receipts[i-1].receipt_id;hashWithout(r,'receipt_id');}if(Object.hasOwn(v,'chain_digest')&&mutable(v,'chain_digest'))v.chain_digest=digestValue(v.receipts);}
 }
 visit(value);
 if(mode==='holder'){
  if(Object.hasOwn(value,'attestation_tag')&&mutable(value,'attestation_tag')){const body={...value};delete body.attestation_tag;delete body.attestation_digest;value.attestation_tag=require('node:crypto').createHmac('sha256',Buffer.alloc(32,11)).update(Buffer.concat([Buffer.from('toolkit.github-program.holder-attestation-tag.v1\0'),Buffer.from(canonicalSerialize(body))])).digest('hex');}
  hashWithout(value,'attestation_digest');
 }
 return value.result&&!mutable(value.result,'result_digest')?value:rehash(value);
}

test('Lock-008 executes every field-site mutation through published schema and complete debug/release validators',()=>{
 const {occurrences}=lock008Witnesses();const rows=[];const labels=[];const independentlyRequired=[];const semanticRelationship=[];
 for(const site of fixture.lock008.sites){
  const all=occurrences.get(site.site_id);assert.ok(all.length,site.site_id);
  for(const w of all)for(const action of ['valid','wrong_type','omit','null','unknown_key']){
   const value=copy(w.value);const parent=w.trail.slice(0,-1).reduce((v,k)=>v[k],value);const key=w.trail.at(-1);
   if(action==='wrong_type')parent[key]=Array.isArray(parent[key])?{}:typeof parent[key]==='object'&&parent[key]!==null?0:{};
   if(action==='omit')delete parent[key];
   if(action==='null')parent[key]=null;
   if(action==='unknown_key')parent.__lock008_unknown=true;
   rows.push(raw(w.mode,lock008Repair(value,w.mode,w.trail)));labels.push(`SITE.${String(site.ordinal).padStart(3,'0')}.${action}`);
   independentlyRequired.push(action==='valid'?true:action==='wrong_type'||action==='unknown_key'?false:null);
   semanticRelationship.push(site.ordinal===255&&action==='null'&&w.trail.at(-2)>0?'SEM.MUTATION_HISTORY':null);
  }
 }
 const schema=schemaResults(rows);
 for(let i=0;i<rows.length;i++)if(independentlyRequired[i]!==null)assert.equal(schema[i],independentlyRequired[i],labels[i]+' independent target expectation');
 for(const release of [false,true]){
  const result=oracle(rows,release);
  for(let i=0;i<rows.length;i++)assert.equal(result[i].valid,semanticRelationship[i]?false:schema[i],labels[i]+` complete parity release=${release} contextual=${semanticRelationship[i]||'none'}`);
 }
 recordLock008(labels);
 console.log(`LOCK008_SITE_MUTATION_VECTORS=${rows.length} debug+release PASS`);
});

test('Lock-008 preserves and closes all 27 independently reproduced dynamic disagreements',()=>{
 const entries=Object.values(fixture.lock008.vectors).filter(v=>v.vector_id.startsWith('REGRESSION.DYNAMIC.'));
 assert.equal(entries.length,27);const rows=entries.map(v=>v.exact_probe);
 assert.deepEqual(schemaResults(rows),entries.map(v=>v.future_expected_schema));
 for(const release of [false,true])assert.deepEqual(oracle(rows,release).map(v=>v.valid),entries.map(()=>false));
 recordLock008(entries.map(v=>v.vector_id));
 console.log('LOCK008_DYNAMIC_CLOSED=26 INTENTIONAL_SEMANTIC_ONLY=1');
});

test('Lock-008 executes independent canonical primitive values and UTF8 boundary vectors',()=>{
 const {witnesses}=lock008Witnesses();const rows=[];const entries=[];
 for(const vector of Object.values(fixture.lock008.vectors)){
  if(!Object.hasOwn(vector,'value'))continue;
  const cid=vector.canonical_constraint_id;
  const sites=fixture.lock008.sites.filter(s=>s.canonical_constraint_id===cid||(cid==='LEX.GIT_REF_SYNTAX'&&s.canonical_constraint_id==='SEM.GIT_REF_UTF8_BYTES'));
  assert.ok(sites.length,vector.vector_id+' site');
  const site=sites[0];const w=witnesses.get(site.site_id);const value=copy(w.value);const parent=w.trail.slice(0,-1).reduce((v,k)=>v[k],value);const key=w.trail.at(-1);parent[key]=copy(vector.value);
  if(cid==='NUM.INTEGER_2_9007199254740991'&&Number.isSafeInteger(vector.value)&&vector.value>=2){
   const r=value.result.value.recovery_record;const a=value.result.value.replacement_allocation;
   r.old_fence_sequence=vector.value-1;r.pre_recovery_evidence.old_fence_sequence=vector.value-1;r.replacement_fence_sequence=vector.value;r.new_high_water=vector.value;a.lease.fence_sequence=vector.value;
  }
  rows.push(raw(w.mode,lock008Repair(value,w.mode,w.trail)));entries.push(vector);
 }
 const expected=schemaResults(rows);
 for(const release of [false,true]){
  const got=oracle(rows,release);
  for(let i=0;i<rows.length;i++){
   const v=entries[i];const intentional=v.canonical_constraint_id==='SEM.GIT_REF_UTF8_BYTES'&&v.utf8_bytes>240;
   assert.equal(got[i].valid,intentional?false:expected[i],v.vector_id+` complete acceptance release=${release}`);
  }
 }
 recordLock008(entries.map(v=>v.vector_id));
 console.log(`LOCK008_CANONICAL_VALUE_VECTORS=${rows.length} debug+release PASS`);
});

test('Lock-008 executes site law matrices, conditional overlays, and each Git-ref site boundary',()=>{
 const {witnesses}=lock008Witnesses();const rows=[];const expectedRust=[];const expectedSchema=[];const ids=new Set();
 function add(id,mode,value,rust,schema=rust){rows.push(raw(mode,value));expectedRust.push(rust);expectedSchema.push(schema);ids.add(id);}
 for(const site of fixture.lock008.sites){
  const w=witnesses.get(site.site_id);const ordinal=String(site.ordinal).padStart(3,'0');
  if(site.classification==='SEMANTIC_ONLY'){
   for(const v of Object.values(fixture.lock008.vectors).filter(v=>v.vector_id.startsWith('GIT.UTF8.'))){
    const value=copy(w.value);w.trail.slice(0,-1).reduce((x,k)=>x[k],value)[w.trail.at(-1)]=v.value;
    const id=`SITE.${ordinal}.utf8_${v.utf8_bytes}_${v.vector_id.split('.')[2]}`;add(id,w.mode,lock008Repair(value,w.mode,w.trail),v.expected_standalone_acceptance,v.expected_schema);
   }
  }else{
   const id=`SITE.${ordinal}.canonical_law_matrix`;
   add(id,w.mode,copy(w.value),true);
   const value=copy(w.value);const parent=w.trail.slice(0,-1).reduce((x,k)=>x[k],value);const key=w.trail.at(-1);
   parent[key]=typeof parent[key]==='string'?parent[key]+'\n':{};
   add(id,w.mode,lock008Repair(value,w.mode,w.trail),false);
  }
  if(site.presence_law==='CONDITIONAL_OVERLAY_ON_REQUIRED_OWNER_FIELD'){
   const result=site.json_pointer.startsWith('/$defs/result/');const n=Number(site.json_pointer.match(/\/allOf\/(\d+)/)[1]);
   for(const active of [true,false]){
    const index=active?n:(n+1)%(result?11:5);const value=copy(fixture.responses[result?index:0]);
    if(!result)value.result.value={kind:'READBACK_INSPECTION',target:fixture.readbacks[index].kind,readback:copy(fixture.readbacks[index])};
    add(`SITE.${ordinal}.condition_${active?'true':'false'}`,'response',rehash(value),true);
   }
  }
 }
 assert.deepEqual(schemaResults(rows),expectedSchema,'independent site law/branch/byte expectations');
 for(const release of [false,true]){const got=oracle(rows,release);for(let i=0;i<rows.length;i++)assert.equal(got[i].valid,expectedRust[i],`site law matrix row ${i} release=${release}`);}
 assert.equal(ids.size,528);recordLock008(ids);
 console.log(`LOCK008_SITE_LAW_MATRIX_IDS=${ids.size} EXECUTED_ROWS=${rows.length} debug+release PASS`);
});

test('Lock-008 executes every canonical structural and semantic positive/negative recipe',()=>{
 const {witnesses}=lock008Witnesses();const recipes=Object.values(fixture.lock008.vectors).filter(v=>v.independent_fixture_recipe);
 const rows=[];const wantSchema=[];const wantRust=[];const wantBound=[];const completed=new Set();
 function add(id,mode,value,schema,rust=schema,trail=[],request=null){rows.push(raw(mode,lock008Repair(copy(value),mode,trail),request));wantSchema.push(schema);wantRust.push(rust);wantBound.push(request?false:null);completed.add(id);}
 function readback(index){const v=copy(fixture.responses[0]);v.result.value={kind:'READBACK_INSPECTION',target:fixture.readbacks[index].kind,readback:copy(fixture.readbacks[index])};return rehash(v);}
 for(const recipe of recipes){
  const cid=recipe.canonical_constraint_id;const positive=recipe.vector_id.endsWith('.positive');const id=recipe.vector_id;
  if(cid.startsWith('OBJECT.')||cid.startsWith('PRESENCE.')||cid.startsWith('ARRAY.')){
   const sites=fixture.lock008.sites.filter(s=>s.canonical_constraint_id===cid||s.additional_canonical_constraint_ids.includes(cid));assert.ok(sites.length,cid);
   for(const site of sites){
    const w=witnesses.get(site.site_id);const v=copy(w.value);const parent=w.trail.slice(0,-1).reduce((x,k)=>x[k],v);const key=w.trail.at(-1);
    if(!positive){
     if(cid.startsWith('PRESENCE.')){if(site.presence_law==='OPTIONAL_NON_NULL')parent[key]=null;else delete parent[key];}
     else if(cid.startsWith('ARRAY.'))parent[key]={};
     else {if(parent[key]===null)parent[key]={};parent[key].__lock008_unknown=true;}
    }
    add(id,w.mode,v,positive,positive,w.trail);
   }
   continue;
  }
  let mode='response',v,trail=[];let schema=positive,rust=positive,request=null;
  if(cid==='SHAPE.DESCRIPTOR'){
   for(const [kind,cls,res]of [['GIT_REF_UPDATE','CAS','git_ref'],['CONDITIONAL_PROVIDER_UPDATE','CAS','provider_resource'],['IDEMPOTENT_SET','IDEMPOTENT','provider_resource'],['APPEND_CREATE','APPEND_IDEMPOTENT','provider_collection']]){
    const base=copy(fixture.requests[5]);Object.assign(base.operation.descriptor,{operation_kind:kind,safety_class:cls,target_identity:{resource_type:res,resource_id:'test'},expected_post_state_digest:'a'.repeat(64)});
    if(positive){add(id,'request',base,true);if(kind==='APPEND_CREATE'){base.operation.descriptor.expected_post_state_digest=null;add(id,'request',base,true);}}
    else for(const clause of ['safety_class','resource_type',...(kind==='APPEND_CREATE'?[]:['post_state'])]){v=copy(base);if(clause==='safety_class')v.operation.descriptor.safety_class=cls==='CAS'?'IDEMPOTENT':'CAS';if(clause==='resource_type')v.operation.descriptor.target_identity.resource_type=res==='git_ref'?'provider_resource':'git_ref';if(clause==='post_state')v.operation.descriptor.expected_post_state_digest=null;add(id,'request',v,false);}
   }continue;
  }
  if(cid==='SHAPE.OUTCOME'){
   for(const cls of ['APPLIED','NOT_APPLIED','UNKNOWN']){
    const base=copy(fixture.requests[7]);Object.assign(base.operation.evidence,{classification:cls,observed_post_state_digest:cls==='NOT_APPLIED'?null:'a'.repeat(64),rejection_digest:cls==='NOT_APPLIED'?'a'.repeat(64):null,delayed_completion_excluded:true});
    if(positive){add(id,'request',base,true);if(cls==='UNKNOWN')for(const observed of [null,'a'.repeat(64)])for(const rejected of [null,'a'.repeat(64)])for(const delayed of [true,false]){v=copy(base);Object.assign(v.operation.evidence,{observed_post_state_digest:observed,rejection_digest:rejected,delayed_completion_excluded:delayed});add(id,'request',v,true);}}
    else if(cls!=='UNKNOWN')for(const clause of ['observed_post_state_digest','rejection_digest',...(cls==='NOT_APPLIED'?['delayed_completion_excluded']:[])]){v=copy(base);v.operation.evidence[clause]=clause==='delayed_completion_excluded'?false:v.operation.evidence[clause]===null?'a'.repeat(64):null;add(id,'request',v,false);}
   }continue;
  }
  if(cid==='SHAPE.RUN_READBACK'){for(const started of [true,false]){v=readback(1);v.result.value.readback.started=started;v.result.value.readback.run_started_receipt_id=(started===positive)?'a'.repeat(64):null;add(id,'response',v,positive);}continue;}
  else if(cid==='SHAPE.RECOVERY_READBACK'){v=readback(4);v.result.value.readback.status='TERMINAL';v.result.value.readback.receipt_id=positive?'a'.repeat(64):null;}
  else if(cid==='SHAPE.RECEIPT_SEQUENCE'){v=readback(2);if(!positive)v.result.value.readback.receipts[0].candidate={pr_number:3,branch:'valid/ref',base_ref:'main',base_sha:'1'.repeat(40),head_sha:'1'.repeat(40),tree_sha:'1'.repeat(40)};}
  else if(cid==='SHAPE.APPEND_RECEIPT'){v=copy(fixture.requests[3]);mode='request';if(!positive)v.operation.receipt.receipt_type='RUN_STARTED';}
  else if(cid==='SHAPE.INTERRUPT_RECEIPT'){v=copy(fixture.responses[4]);if(!positive)v.result.value.receipt.receipt_type='EXECUTOR_TERMINAL';}
  else if(cid==='SHAPE.REF_SNAPSHOT'){v=copy(fixture.requests[1]);mode='request';if(!positive)v.operation.start.ref.detached=true;}
  else if(cid==='SHAPE.RESPONSE'){v=copy(fixture.responses[0]);if(!positive)v.error={code:'BROKER_BUSY'};}
  else if(cid==='SHAPE.RESULT_KIND'){for(let i=0;i<11;i++){v=copy(fixture.responses[i]);if(!positive)v.result.operation=fixture.responses[(i+1)%11].result.operation;add(id,'response',v,positive);}continue;}
  else if(cid==='SHAPE.READBACK_KIND'){for(let i=0;i<5;i++){v=readback(i);if(!positive)v.result.value.target=fixture.readbacks[(i+1)%5].kind;add(id,'response',v,positive);}continue;}
  else if(cid==='SHAPE.SUCCESS_KIND'){for(let i=0;i<11;i++){v=copy(fixture.responses[i]);if(!positive)v.result.value.__lock008_unknown=true;add(id,'response',v,positive);}continue;}
  else if(cid==='SHAPE.HISTORY_LOCAL'){if(positive){v=readback(3);}else{for(const index of [0,1])for(const key of ['state','event_type']){v=readback(3);v.result.value.readback.events[index][key]=index===0?'IN_FLIGHT':'PREPARED';add(id,'response',v,false);}continue;}}
  else if(cid==='SEM.WIRE_CANONICAL'){
   const request=copy(fixture.requests[0]);const text=canonicalSerialize(request);rows.push({mode:'request',raw:positive?text:'{"request_id":"'+fixture.request_id+'",'+text.slice(1)});wantSchema.push(true);wantRust.push(positive);wantBound.push(null);completed.add(id);continue;
  }
  else if(cid==='SEM.RESOURCE_BYTES'){v=copy(fixture.requests[3]);mode='request';if(!positive)v.operation.receipt.payload.evidence_refs=Array.from({length:50},(_,i)=>({id:String(i).padEnd(160,'x'),digest:'a'.repeat(64)}));schema=true;}
  else if(cid==='SEM.TARGET_HASH'){v=copy(fixture.requests[5]);mode='request';trail=['operation','descriptor','target_digest'];if(!positive)v.operation.descriptor.target_digest='b'.repeat(64);schema=true;}
  else if(cid==='SEM.OPERATION_INTEGRITY'){v=readback(3);if(!positive)v.result.value.readback.operation.provider_operation_key='gpr:wrong';schema=true;}
  else if(cid==='SEM.OUTCOME_INTEGRITY'){v=copy(fixture.requests[7]);mode='request';trail=['operation','evidence','evidence_digest'];if(!positive)v.operation.evidence.evidence_digest='b'.repeat(64);schema=true;}
  else if(cid==='SEM.RECEIPT_INTEGRITY'){v=copy(fixture.responses[3]);trail=['result','value','receipt','receipt_id'];if(!positive)v.result.value.receipt.receipt_id='b'.repeat(64);schema=true;}
  else if(cid==='SEM.LEASE_TIME'){v=copy(fixture.responses[1]);if(!positive)v.result.value.allocation.lease.expires_at=v.result.value.allocation.lease.issued_at;schema=true;}
  else if(cid==='SEM.CHAIN'){v=readback(2);if(!positive)v.result.value.readback.receipts[1].run_id='wrong-run';schema=true;}
  else if(cid==='SEM.MUTATION_HISTORY'){v=readback(3);if(!positive)v.result.value.readback.state='UNKNOWN';schema=true;}
  else if(cid==='SEM.RECOVERY_EVIDENCE'){v=copy(fixture.responses[9]);if(!positive)v.result.value.recovery_record.pre_recovery_evidence.authority_observed_at='9999-12-31T23:59:59.999Z';schema=true;}
  else if(cid==='SEM.RECOVERY_RECORD'){v=copy(fixture.responses[9]);if(!positive)v.result.value.recovery_record.new_high_water+=1;schema=true;}
  else if(cid==='SEM.NAMESPACE_HASH'){v=readback(0);trail=['result','value','readback','namespace_digest'];if(!positive)v.result.value.readback.namespace_digest='b'.repeat(64);schema=true;}
  else if(cid==='SEM.RESULT_HASH'){v=copy(fixture.responses[0]);trail=['result','result_digest'];if(!positive)v.result.result_digest='b'.repeat(64);schema=true;}
  else if(cid==='SEM.REQUEST_BINDING'){
   for(let i=0;i<11;i++)for(let j=0;j<11;j++)if((i===j)===positive){rows.push(raw('response',fixture.responses[j],fixture.requests[i]));wantSchema.push(true);wantRust.push(true);wantBound.push(positive);completed.add(id);}continue;
  }
  else if(cid==='SEM.HOLDER_AUTH'){v=copy(fixture.holder);mode='holder';trail=['attestation_tag'];if(!positive)v.attestation_tag='b'.repeat(64);schema=true;}
  else assert.fail('Unimplemented canonical recipe '+cid);
  add(id,mode,v,schema,rust,trail,request);
 }
 assert.equal(completed.size,114);
 assert.deepEqual(schemaResults(rows),wantSchema,'independent recipe schema expectations');
 for(const release of [false,true]){const got=oracle(rows,release);for(let i=0;i<rows.length;i++){assert.equal(got[i].valid,wantRust[i],`recipe row ${i} release=${release}`);if(wantBound[i]!==null)assert.equal(got[i].bound,wantBound[i],`recipe binding row ${i}`);}}
 recordLock008(completed);
 console.log(`LOCK008_CANONICAL_RECIPE_IDS=114 EXECUTED_ROWS=${rows.length} debug+release PASS`);
});

test('Lock-008 checks all 24 integer fields at exact public bounds',()=>{
 const {witnesses}=lock008Witnesses();const rows=[],expected=[],rustExpected=[],labels=[];
 for(const site of fixture.lock008.sites.filter(s=>s.integer_bounds)){
  const w=witnesses.get(site.site_id);const {minimum:min,maximum:max}=site.integer_bounds;
  for(const n of [...new Set([min-1,min,max-1,max,max+1])]){
   const value=copy(w.value);const parent=w.trail.slice(0,-1).reduce((x,k)=>x[k],value);const key=w.trail.at(-1);parent[key]=n;
   const inRange=n>=min&&n<=max;let semantic=true;
   if([164,201,214,217].includes(site.ordinal)&&inRange){
    const record=value.result.value.recovery_record;const allocation=value.result.value.replacement_allocation;
    if([154,155].includes(site.ordinal)){record[key]=n;}
    else {
     const old=[164,201].includes(site.ordinal)?n:n-1;
     record.old_fence_sequence=old;record.pre_recovery_evidence.old_fence_sequence=old;
     record.replacement_fence_sequence=old+1;record.new_high_water=old+1;allocation.lease.fence_sequence=old+1;
     // N+1 is a separately published semantic relationship. A max old fence has no safe successor.
     if(old===Number.MAX_SAFE_INTEGER){record.replacement_fence_sequence=Number.MAX_SAFE_INTEGER;record.new_high_water=Number.MAX_SAFE_INTEGER;allocation.lease.fence_sequence=Number.MAX_SAFE_INTEGER;semantic=false;}
    }
   }
   if(site.ordinal===109&&n===1){parent.receipt_type='RUN_STARTED';parent.prior_receipt_id=null;parent.candidate=null;value.result.operation='READBACK_INSPECTION';value.result.value={kind:'READBACK_INSPECTION',target:'RECEIPT_CHAIN',readback:{...copy(fixture.readbacks[2]),receipts:[parent]}};}
   // Event sequence is bounded independently and also equals its actual history index.
   if(site.ordinal===254&&n!==w.trail.at(-2)+1)semantic=false;
   rows.push(raw(w.mode,lock008Repair(value,w.mode,w.trail)));expected.push(inRange);rustExpected.push(inRange&&semantic);labels.push(site.site_id+'='+n);
  }
 }
 const standard=schemaResults(rows);for(let i=0;i<rows.length;i++)assert.equal(standard[i],expected[i],labels[i]+' schema');
 for(const release of [false,true]){const got=oracle(rows,release);for(let i=0;i<rows.length;i++)assert.equal(got[i].valid,rustExpected[i],labels[i]+` release=${release}`);}
 console.log(`LOCK008_INTEGER_SITES=24 BOUNDARY_ROWS=${rows.length} debug+release PASS`);
});

test('Lock-008 timestamp grammar rejects every noncanonical lexical alternative',()=>{
 const {witnesses}=lock008Witnesses();const site=fixture.lock008.sites.find(s=>s.canonical_constraint_id.includes('TIMESTAMP'));const w=witnesses.get(site.site_id);
 const values=['2024-02-29T00:00:00Z','2024-02-29T00:00:00.1Z','2024-02-29T00:00:00.12Z','2024-02-29T00:00:00.1234Z','2024-02-29T00:00:00.123+00:00','2024-02-29T00:00:00.123-00:00','2024-02-29T00:00:00.123z','2024-13-01T00:00:00.000Z','2024-04-31T00:00:00.000Z','1900-02-29T00:00:00.000Z','2024-02-29T00:00:60.000Z',' 2024-02-29T00:00:00.000Z','2024-02-29T00:00:00.000Z\n','2024-02-29T00:00:00.000Z ','2024-02-29t00:00:00.000Z'];
 const rows=values.map(x=>{const value=copy(w.value);w.trail.slice(0,-1).reduce((v,k)=>v[k],value)[w.trail.at(-1)]=x;return raw(w.mode,lock008Repair(value,w.mode,w.trail));});
 assert.deepEqual(schemaResults(rows),values.map(()=>false));for(const release of [false,true])assert.deepEqual(oracle(rows,release).map(x=>x.valid),values.map(()=>false));
});

test('Lock-008 execution has no omitted accepted vector IDs',()=>{
 assert.deepEqual([...lock008ExecutedIds].sort(),Object.keys(fixture.lock008.vectors).sort());
 console.log('SUCCESSOR_VECTOR_TOTAL=2940 SUCCESSOR_VECTOR_PASSED=2940 SUCCESSOR_VECTOR_FAILED=0');
});

test('Lock-008 rejects each canonical primitive negative at every mapped field site',()=>{
 const {witnesses}=lock008Witnesses();const rows=[],labels=[];
 for(const site of fixture.lock008.sites){
  if(site.presence_law==='CONDITIONAL_OVERLAY_ON_REQUIRED_OWNER_FIELD')continue;
  const cid=site.canonical_constraint_id==='SEM.GIT_REF_UTF8_BYTES'?'LEX.GIT_REF_SYNTAX':site.canonical_constraint_id;
  const vectors=Object.values(fixture.lock008.vectors).filter(v=>v.canonical_constraint_id===cid&&v.expected_primary_acceptance===false&&Object.hasOwn(v,'value'));
  const w=witnesses.get(site.site_id);
  for(const vector of vectors){const value=copy(w.value);w.trail.slice(0,-1).reduce((v,k)=>v[k],value)[w.trail.at(-1)]=copy(vector.value);rows.push(raw(w.mode,lock008Repair(value,w.mode,w.trail)));labels.push(site.site_id+' '+vector.vector_id);}
 }
 const schema=schemaResults(rows);for(let i=0;i<rows.length;i++)assert.equal(schema[i],false,labels[i]+' published assertion');
 for(const release of [false,true]){const got=oracle(rows,release);for(let i=0;i<rows.length;i++)assert.equal(got[i].valid,false,labels[i]+` release=${release}`);}
 console.log(`LOCK008_PER_SITE_PRIMITIVE_NEGATIVES=${rows.length} debug+release PASS`);
});
