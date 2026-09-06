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
 run(schemaPython,['-m','pip','--isolated','install','--disable-pip-version-check','--no-input','--quiet','--index-url','https://pypi.org/simple','jsonschema==4.26.0']);
 console.log('LOCK007_SCHEMA_ORACLE=jsonschema==4.26.0 isolated CI environment');
 return schemaPython;
}
test.after(()=>{for(const dir of ownedTemporaryRoots){assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('toolkit-lock007-'));fs.rmSync(dir,{recursive:true,force:true});}});

function run(command,args,options={}){const r=cp.spawnSync(command,args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:16*1024*1024,...options});assert.equal(r.status,0,`${command}: ${r.error?.message||''}\n${r.stdout}\n${r.stderr}`);return r.stdout;}
function oracle(rows,release=false){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'toolkit-lock007-oracle-'));const input=path.join(dir,'cases.json');try{fs.writeFileSync(input,JSON.stringify(rows));const output=run('cargo',['+1.98.0','test','--locked','--manifest-path',manifest,...(release?['--release']:[]),'--test','contracts','external_oracle','--','--ignored','--exact','--nocapture'],{env:{...process.env,CARGO_TARGET_DIR:cargoTarget,BROKER_ORACLE_INPUT:input}});const match=output.match(/^ORACLE_JSON=([^\r\n]+)$/m);assert.ok(match,'Rust oracle output missing');return JSON.parse(match[1]);}finally{fs.unlinkSync(input);fs.rmdirSync(dir);}}
const raw=(mode,v,request)=>({mode,raw:canonicalSerialize(v),...(request?{request}:{})});
const copy=structuredClone;
function rehash(v){if(v.result?.value && Object.hasOwn(v.result,"result_digest")){v.result.result_digest=digestValue(Object.fromEntries(["operation","value"].filter(k=>Object.hasOwn(v.result,k)).map(k=>[k,v.result[k]])));}return v;}
function schemaResults(rows){const code=String.raw`
import json,sys,pathlib
from jsonschema import Draft202012Validator,FormatChecker
from referencing import Registry,Resource
from urllib.parse import urljoin
from datetime import datetime
# Every protocol timestamp schema requires canonical UTC milliseconds. Use the
# independent standard-library calendar parser unconditionally: optional format
# packages must never decide whether these assertions run.
formats=FormatChecker()
@formats.checks("date-time", raises=ValueError)
def canonical_timestamp(value):
 if not isinstance(value,str): return True
 datetime.strptime(value,"%Y-%m-%dT%H:%M:%S.%fZ")
 return True
assert not formats.conforms("2026-02-30T00:00:00.000Z","date-time"), "DATE_TIME_CHECKER_UNAVAILABLE"
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
validators={m:Draft202012Validator({'$ref':uri+('' if m=='request' else '#/$defs/response')},registry=registry,format_checker=formats) for m in ['request','response']}
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
 add(canonicalSerialize(req).replace('{','{"request_id":"'+id+'",'),false);add(canonicalSerialize(req).replace('{','{"request_\\u0069d":"'+id+'",'),false);add(' '+canonicalSerialize(req),false);
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
