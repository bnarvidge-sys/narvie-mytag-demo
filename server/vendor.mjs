// Tag Data Protocol v2.3.3 + supplied C#/Java helpers: UTF-8 key/data, ECB,
// PKCS7 (Java calls the equivalent DES block padding PKCS5), standard Base64.
// No supplier end-to-end request vector or timestamp convention received yet.
import {createHash, createCipheriv, createDecipheriv, randomBytes, randomUUID} from 'node:crypto';

export class IntegrationError extends Error {
  constructor(code, status=502, details={}) {
    super(code); this.code=code; this.status=status;
    if(['token','location'].includes(details.operation))this.operation=details.operation;
    if(/^\d{4}$/.test(details.vendorCode||''))this.vendorCode=details.vendorCode;
  }
}
export function vendorEndpoint(config) {
  let url;try {url=new URL(config.baseURL);}catch {throw new IntegrationError('VENDOR_HTTPS_REQUIRED',503);}
  if(url.href==='https://test.trackthat.top/')return url;
  if(url.href==='http://test.trackthat.top/') {
    if(config.allowHttpTest===true)return url;
    throw new IntegrationError('VENDOR_HTTP_TEST_NOT_APPROVED',503);
  }
  throw new IntegrationError('VENDOR_HTTPS_REQUIRED',503);
}
export function deriveKey(random, token, unique='') {
  if(!/^[A-Za-z0-9]{16}$/.test(random)) throw new IntegrationError('INVALID_RANDOM');
  return Buffer.from(createHash('md5').update(random+token+unique,'utf8').digest('hex').slice(-24).toUpperCase(),'ascii');
}
export function encryptJSON(value,key) {
  const cipher=createCipheriv('des-ede3',key,null);
  return Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]).toString('base64');
}
export function decryptJSON(value,key) {
  try {
    if(typeof value!=='string'||value.length>1_000_000||!value.length||value.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw Error();
    const bytes=Buffer.from(value,'base64');
    if(!bytes.length||bytes.length%8||bytes.toString('base64')!==value) throw Error();
    const decipher=createDecipheriv('des-ede3',key,null);
    return JSON.parse(Buffer.concat([decipher.update(bytes),decipher.final()]).toString('utf8'));
  } catch { throw new IntegrationError('VENDOR_ENCODING_UNVERIFIED'); }
}
export function requestTime(date,zone) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}
const numeric=v=>typeof v==='number'&&Number.isFinite(v);
export function normalizeObservations(rows,{timestampUnit,now=Date.now()}={}) {
  if(!Array.isArray(rows)||rows.length>10_000) throw new IntegrationError('VENDOR_RESPONSE_INVALID');
  if(!['seconds','milliseconds'].includes(timestampUnit)) throw new IntegrationError('TIMESTAMP_UNIT_REQUIRED',503);
  const observations=rows.flatMap(row=>{
    if(!row||!numeric(row.latitude)||!numeric(row.longitude)||Math.abs(row.latitude)>90||Math.abs(row.longitude)>180||!numeric(row.timestamp)||row.timestamp<=0) return [];
    const ms=row.timestamp*(timestampUnit==='seconds'?1000:1);
    if(!Number.isSafeInteger(ms)||ms<Date.UTC(2020,0,1)||ms>now+300_000) return [];
    return [{latitude:row.latitude,longitude:row.longitude,observedAt:new Date(ms).toISOString(),
      accuracy:numeric(row.accuracy)&&row.accuracy>0?row.accuracy:null,
      confidence:numeric(row.confidence)?row.confidence:null,
      batteryCategory:({'00':'unknown','01':'high','02':'medium','03':'low','04':'depleted'})[row.batteryLevel]||'unknown',
      motion:({'00':'unknown','01':'stationary','02':'moving'})[row.mstatus]||'unknown',
      reportedTagType:row.tagtype===0?'apple':row.tagtype===1?'android':'unknown',
      stale:now-ms>24*60*60*1000}];
  });
  observations.sort((a,b)=>b.observedAt.localeCompare(a.observedAt));
  return {isDemo:false,source:'supplier-api',state:observations.length?'observation':'no_location',observation:observations[0]||null,
    rejectedRecords:rows.length-observations.length,retrievedAt:new Date(now).toISOString()};
}

export class VendorClient {
  constructor(config,{fetchImpl=fetch,now=()=>new Date(),random=()=>randomBytes(12).toString('hex').slice(0,16),guid=()=>randomUUID().replaceAll('-','')}={}) {
    this.config=config;this.fetch=fetchImpl;this.now=now;this.random=random;this.guid=guid;
  }
  async post(path,unique='') {
    const c=this.config;
    if(c.codec!=='md5hex-ascii24-base64'||!c.token||!c.timeZone) throw new IntegrationError('SERVER_NOT_CONFIGURED',503);
    const base=vendorEndpoint(c);
    const random=this.random(),key=deriveKey(random,c.token,unique);
    const payload={guid:this.guid(),token:c.token,time:requestTime(this.now(),c.timeZone)};
    if(unique) Object.assign(payload,{unique,sn:c.sn});
    const headers={'Content-Type':'application/x-www-form-urlencoded',token:c.token};
    if(unique) headers.unique=unique;
    let response;
    try { response=await this.fetch(new URL(path,base),{method:'POST',headers,body:new URLSearchParams({data:encryptJSON(payload,key)+random}),signal:AbortSignal.timeout(12_000),redirect:'error'}); }
    catch { throw new IntegrationError('VENDOR_UNREACHABLE'); }
    if(!response.ok) throw new IntegrationError('VENDOR_HTTP_ERROR');
    const text=await boundedText(response);
    let data;try { data=JSON.parse(text); } catch { throw new IntegrationError('VENDOR_RESPONSE_INVALID'); }
    if(!data||!['true',true].includes(data.success)||data.code!=='0000') throw new IntegrationError('VENDOR_ACCESS_REJECTED',502,{
      operation:path==='/v1/Mer/GTagToken'?'token':'location',
      vendorCode:typeof data?.code==='string'?data.code:''
    });
    return {data,key};
  }
  async probe() {
    const {data}=await this.post('/v1/Mer/GTagToken');
    if(typeof data.unique!=='string'||!data.unique||data.unique.length>256) throw new IntegrationError('VENDOR_RESPONSE_INVALID');
    return {unique:data.unique};
  }
  async location() {
    if(this.config.assignmentConfirmed!==true)throw new IntegrationError('TRACKER_ASSIGNMENT_REQUIRED',503);
    if(!this.config.sn||!/^[A-Za-z0-9_-]{4,64}$/.test(this.config.sn)) throw new IntegrationError('TRACKER_NOT_CONFIGURED',503);
    const {unique}=await this.probe();
    const {data,key}=await this.post(this.config.version==='v2'?'/v2/Mer/GTagGps':'/v1/Mer/GTagGps',unique);
    return normalizeObservations(decryptJSON(data.data,key),{timestampUnit:this.config.timestampUnit,now:this.now().getTime()});
  }
}
async function boundedText(response) {
  const reader=response.body?.getReader();
  if(!reader) throw new IntegrationError('VENDOR_RESPONSE_INVALID');
  let size=0;const chunks=[];
  try { for(;;) {const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1_000_000)throw Error();chunks.push(Buffer.from(value));} }
  catch { await reader.cancel().catch(()=>{});throw new IntegrationError('VENDOR_RESPONSE_INVALID'); }
  return Buffer.concat(chunks).toString('utf8');
}
