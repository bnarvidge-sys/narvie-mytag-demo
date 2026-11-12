import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {scryptSync} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {VendorClient,IntegrationError,deriveKey,encryptJSON,decryptJSON,normalizeObservations,requestTime} from '../server/vendor.mjs';
import {createHandler,configFromEnv,readiness} from '../server/app.mjs';

const salt=Buffer.alloc(16,42),password='test-only-password-not-production';
const passwordHash=`scrypt:${salt.toString('hex')}:${scryptSync(password,salt,64).toString('hex')}`;
const config={...configFromEnv({}),token:'test-merchant-not-real',sn:'SAMPLE000001',passwordHash,codec:'md5hex-ascii24-base64',timeZone:'UTC',timestampUnit:'seconds',version:'v1',assignmentConfirmed:true};
const date=new Date('2026-11-10T12:00:00Z');
async function call(handler,path,{method='GET',body,session,origin='https://narvie-mytag-demo.onrender.com',extraHeaders={}}={}) {
  const text=body===undefined?'':JSON.stringify(body);
  const req=Readable.from(text?[Buffer.from(text)]:[]);Object.assign(req,{method,url:path,headers:{origin,...(body===undefined?{}:{'content-type':'application/json','content-length':String(Buffer.byteLength(text))}),...(session?{authorization:'Bearer '+session}:{}),...extraHeaders}});
  const result={headers:{},status:0};const res={setHeader(k,v){result.headers[k.toLowerCase()]=v;},writeHead(status,headers={}){result.status=status;for(const [k,v]of Object.entries(headers))this.setHeader(k,v);},end(value){result.body=value===undefined?null:JSON.parse(value.toString());}};
  await handler(req,res);return result;
}
test('configuration never embeds user code or merchant credentials in web files',()=>{
  assert.equal(readiness(configFromEnv({})).ready,false);
  for(const file of ['app.js','live.js','adapters.js','sw.js']){
    const source=readFileSync(new URL((existsSync(new URL('../www/',import.meta.url))?'../www/':'../mytag/')+file,import.meta.url),'utf8');
    assert.ok(!/\b[0-9]{10}\b/.test(source));assert.ok(!source.includes(config.token));
  }
});
test('personal session protects sample SN and every upstream call',async()=>{
  let calls=0;const handler=createHandler({config,vendor:{location:async()=>{calls++;}}});
  for(const path of ['tracker','location','probe']) {
    const result=await call(handler,'/api/mytag/'+path,{method:path==='tracker'?'GET':'POST'});
    assert.equal(result.status,401);assert.equal(result.headers['cache-control'],'no-store');
  }
  assert.equal(calls,0);
  assert.equal((await call(handler,'/api/mytag/session',{method:'POST',body:{password:'wrong'}})).status,401);
  const login=await call(handler,'/api/mytag/session',{method:'POST',body:{password}});assert.equal(login.status,200);
  const result=await call(handler,'/api/mytag/tracker',{session:login.body.session});assert.equal(result.body.sn,config.sn);
  const logout=await call(handler,'/api/mytag/logout',{method:'POST',session:login.body.session});assert.equal(logout.status,200);
  assert.equal((await call(handler,'/api/mytag/tracker',{session:login.body.session})).status,401);
});
test('CORS, expiring sessions and guess throttling reject unintended access',async()=>{
  let clock=Date.now();const handler=createHandler({config,now:()=>clock});
  assert.equal((await call(handler,'/api/mytag/status',{origin:'https://untrusted.test'})).status,403);
  assert.equal((await call(handler,'/api/mytag/status',{origin:'null'})).status,403);
  assert.equal((await call(handler,'/api/mytag/status?token=x')).status,400);
  const login=await call(handler,'/api/mytag/session',{method:'POST',body:{password}});
  clock+=31*60_000;assert.equal((await call(handler,'/api/mytag/tracker',{session:login.body.session})).status,401);
  for(let i=0;i<5;i++)assert.equal((await call(handler,'/api/mytag/session',{method:'POST',body:{password:'wrong'}})).status,401);
  assert.equal((await call(handler,'/api/mytag/session',{method:'POST',body:{password}})).status,429);
});
test('only configured sample may be queried; vendor attempts are bounded and errors sanitized',async()=>{
  let calls=0;const handler=createHandler({config,vendor:{location:async()=>{calls++;throw Error('private token secret');}}});
  const {body}=await call(handler,'/api/mytag/session',{method:'POST',body:{password}});const session=body.session;
  assert.equal((await call(handler,'/api/mytag/location',{method:'POST',session,body:{sn:'ANOTHER-TAG'}})).status,400);
  const result=await call(handler,'/api/mytag/location',{method:'POST',session});assert.equal(result.status,500);assert.deepEqual(result.body,{error:'INTERNAL_ERROR'});
  assert.equal((await call(handler,'/api/mytag/location',{method:'POST',session})).status,429);assert.equal(calls,1);
});
test('candidate request profile uses form encoding, fresh unique, and decrypts fixture without leaking secrets',async()=>{
  const requests=[];const random='0123456789ABCDEF';const unique='fixture-unique';
  const rows=[{latitude:52.6,longitude:4.7,timestamp:date.getTime()/1000,batteryLevel:'02',accuracy:12}];
  const client=new VendorClient(config,{random:()=>random,now:()=>date,fetchImpl:async(url,options)=>{
    requests.push({url:String(url),options});
    if(requests.length===1)return new Response(JSON.stringify({code:'0000',success:'true',unique}));
    return new Response(JSON.stringify({code:'0000',success:true,data:encryptJSON(rows,deriveKey(random,config.token,unique))}));
  }});
  const location=await client.location();assert.equal(location.isDemo,false);assert.equal(location.state,'observation');assert.equal(location.observation.batteryCategory,'medium');
  assert.equal(requests.length,2);assert.equal(requests[0].options.redirect,'error');
  for(const [i,request]of requests.entries()) {
    const data=request.options.body.get('data');assert.equal(data.slice(-16),random);
    const payload=decryptJSON(data.slice(0,-16),deriveKey(random,config.token,i?unique:''));
    assert.equal(payload.time,'2026-11-10 12:00:00');assert.equal(payload.token,config.token);
    if(i)assert.equal(payload.sn,config.sn);else assert.equal(payload.sn,undefined);
  }
});
test('transport refuses HTTP, unknown host, redirects, malformed data and access denial',async()=>{
  let calls=0;
  for(const baseURL of ['http://test.trackthat.top/','https://evil.test/','https://test.trackthat.top/?token=x']){
    const client=new VendorClient({...config,baseURL},{fetchImpl:async()=>{calls++;}});
    await assert.rejects(client.probe(),{code:baseURL==='http://test.trackthat.top/'?'VENDOR_HTTP_TEST_NOT_APPROVED':'VENDOR_HTTPS_REQUIRED'});
  }
  assert.equal(calls,0);
  const client=new VendorClient(config,{fetchImpl:async()=>new Response(JSON.stringify({success:false,msg:'private detail',code:'bad'}))});
  await assert.rejects(client.probe(),{code:'VENDOR_ACCESS_REJECTED'});
  assert.throws(()=>decryptJSON('invalid!',deriveKey('0123456789ABCDEF','test')),{code:'VENDOR_ENCODING_UNVERIFIED'});
});
test('normalization keeps location time distinct, battery categorical and missing data unknown',()=>{
  const now=date.getTime(),timestamp=(now-2*24*60*60_000)/1000;
  const result=normalizeObservations([{latitude:0,longitude:0,timestamp,accuracy:0,batteryLevel:'03',status:'00'},
    {latitude:null,longitude:4,timestamp},{latitude:91,longitude:4,timestamp},{latitude:52,longitude:4,timestamp:0},
    {latitude:52,longitude:4,timestamp:(now+60*60_000)/1000}],{timestampUnit:'seconds',now});
  assert.equal(result.rejectedRecords,4);assert.equal(result.observation.latitude,0);assert.equal(result.observation.accuracy,null);
  assert.equal(result.observation.batteryCategory,'low');assert.equal(result.observation.battery,undefined);assert.equal(result.observation.nearby,undefined);
  assert.equal(result.observation.stale,true);assert.notEqual(result.observation.observedAt,result.retrievedAt);
  assert.equal(normalizeObservations([],{timestampUnit:'milliseconds',now}).state,'no_location');
  assert.throws(()=>normalizeObservations([]),{code:'TIMESTAMP_UNIT_REQUIRED'});
  assert.equal(requestTime(date,'Asia/Shanghai'),'2026-11-10 20:00:00');
});

test('confirmed millisecond timestamps remain exact and malformed records expose only safe type information',async()=>{
  const now=date.getTime();
  const result=normalizeObservations([{latitude:0,longitude:0,timestamp:now-1234}],{timestampUnit:'milliseconds',now});
  assert.equal(result.observation.observedAt,new Date(now-1234).toISOString());
  const c={...config,timestampUnit:'milliseconds'};
  const handler=createHandler({config:c,vendor:{location:async()=>normalizeObservations({private:'secret location'},{timestampUnit:'milliseconds'})}});
  const login=await call(handler,'/api/mytag/session',{method:'POST',body:{password}});
  const reply=await call(handler,'/api/mytag/location',{method:'POST',session:login.body.session});
  assert.deepEqual(reply.body,{error:'VENDOR_RESPONSE_INVALID',operation:'location',stage:'location-records',responseType:'object'});
  assert.equal(reply.headers['cache-control'],'no-store');
  const unsafe=new IntegrationError('VENDOR_RESPONSE_INVALID',502,{stage:'secret',responseType:'secret',vendorCode:'secret'});
  assert.equal(unsafe.stage,undefined);assert.equal(unsafe.responseType,undefined);assert.equal(unsafe.vendorCode,undefined);
});

test('server secret password is hashed at boot and readiness never returns secrets',()=>{
  const c=configFromEnv({NARVIE_OWNER_PASSWORD:password});
  assert.match(c.passwordHash,/^scrypt:/);assert.equal(c.password,undefined);
  assert.equal(readiness(c).loginConfigured,true);
  assert.ok(!JSON.stringify(readiness(c)).includes(password));
  assert.equal(readiness(configFromEnv({NARVIE_OWNER_PASSWORD:'short'})).loginConfigured,false);
  const tokenOnly={...config,sn:'',timestampUnit:''};
  assert.equal(readiness(tokenOnly).ready,false);assert.equal(readiness(tokenOnly).canProbe,true);
});

test('HTTP test transport requires an explicit flag and is restricted to the exact test host',async()=>{
  let called='';const c={...config,baseURL:'http://test.trackthat.top/',allowHttpTest:true};
  const client=new VendorClient(c,{fetchImpl:async(url)=>{called=String(url);return Response.json({success:true,code:'0000',unique:'fixture'});}});
  await client.probe();assert.equal(called,'http://test.trackthat.top/v1/Mer/GTagToken');
  assert.equal(readiness(c).vendorTransport,'http-test');
  assert.equal(readiness({...c,allowHttpTest:false}).canProbe,false);
  for(const baseURL of ['http://other.test/','http://test.trackthat.top:8080/','http://test.trackthat.top/?x=1','http://user:pass@test.trackthat.top/']){
    const rejected=new VendorClient({...c,baseURL},{fetchImpl:async()=>{throw Error('must not fetch');}});
    await assert.rejects(rejected.probe(),{code:'VENDOR_HTTPS_REQUIRED'});
  }
});
test('Auth code never substitutes for SN, and assignment gates location before upstream calls',async()=>{
  const c=configFromEnv({MYTAG_TEST_AUTH_CODE:'AUTH-CODE',MYTAG_TEST_SN:'AUTH-CODE'});assert.equal(c.sn,'');
  assert.ok(readiness(c).missing.includes('tracker_sn'));assert.ok(readiness(c).missing.includes('tracker_assignment'));
  let calls=0;const pending=new VendorClient({...config,assignmentConfirmed:false},{fetchImpl:async()=>{calls++;}});
  await assert.rejects(pending.location(),{code:'TRACKER_ASSIGNMENT_REQUIRED'});assert.equal(calls,0);
  assert.equal(readiness({...config,assignmentConfirmed:false}).canProbe,true);
  assert.equal(readiness({...config,assignmentConfirmed:false}).ready,false);
});

test('authenticated v2 rejection exposes only bounded code and operation, never vendor messages or token',async()=>{
  const c={...config,version:'v2'};const paths=[];
  const vendor=new VendorClient(c,{fetchImpl:async(url)=>{
    paths.push(new URL(url).pathname);
    return Response.json(paths.length===1?{success:true,code:'0000',unique:'test-unique'}:{success:false,code:'1002',msg:'secret '+c.token,data:'private-location'});
  }});
  const handler=createHandler({config:c,vendor});
  const login=await call(handler,'/api/mytag/session',{method:'POST',body:{password}});
  const result=await call(handler,'/api/mytag/location',{method:'POST',session:login.body.session});
  assert.equal(result.status,502);assert.deepEqual(result.body,{error:'VENDOR_ACCESS_REJECTED',operation:'location',vendorCode:'1002'});
  assert.deepEqual(paths,['/v1/Mer/GTagToken','/v2/Mer/GTagGps']);assert.equal(result.headers['cache-control'],'no-store');
  const rejected=new VendorClient(c,{fetchImpl:async()=>Response.json({success:false,code:c.token,msg:'private'})});
  await assert.rejects(rejected.probe(),error=>error.code==='VENDOR_ACCESS_REJECTED'&&error.operation==='token'&&error.vendorCode===undefined);
});
