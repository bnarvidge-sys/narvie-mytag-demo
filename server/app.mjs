import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {scryptSync,timingSafeEqual,randomBytes,createHash} from 'node:crypto';
import {VendorClient,IntegrationError} from './vendor.mjs';

export function configFromEnv(env=process.env) {
  // Hosting secret option for a nontechnical owner. Hash at boot, never return it.
  let passwordHash=env.NARVIE_OWNER_PASSWORD_HASH||'';
  if(!passwordHash&&typeof env.NARVIE_OWNER_PASSWORD==='string'&&env.NARVIE_OWNER_PASSWORD.length>=12&&env.NARVIE_OWNER_PASSWORD.length<=256){
    const salt=randomBytes(16);passwordHash=`scrypt:${salt.toString('hex')}:${scryptSync(env.NARVIE_OWNER_PASSWORD,salt,64).toString('hex')}`;
  }
  const c={token:env.MYTAG_MERCHANT_TOKEN||'',baseURL:env.MYTAG_BASE_URL||'https://test.trackthat.top/',sn:env.MYTAG_TEST_SN||'',
    codec:env.MYTAG_CODEC_PROFILE||'',timeZone:env.MYTAG_REQUEST_TIMEZONE||'',timestampUnit:env.MYTAG_TIMESTAMP_UNIT||'',version:env.MYTAG_API_VERSION||'v1',
    passwordHash,allowedOrigins:(env.NARVIE_ALLOWED_ORIGINS||'https://narvie-mytag-demo.onrender.com,https://narvie-mytag-test.onrender.com').split(',').map(v=>v.trim()),
    trackerName:env.MYTAG_TEST_NAME||'Mijn Narvie-testtracker'};
  if(c.timeZone) try {new Intl.DateTimeFormat('en',{timeZone:c.timeZone});}catch {c.timeZone='';}
  return c;
}
export function readiness(c) {
  const missing=[];
  if(!validPasswordHash(c.passwordHash))missing.push('owner_login');
  if(!c.token)missing.push('vendor_token');
  if(!/^[A-Za-z0-9_-]{4,64}$/.test(c.sn))missing.push('tracker_sn');
  if(c.codec!=='md5hex-ascii24-base64')missing.push('encoding_profile');
  if(!c.timeZone)missing.push('request_timezone');
  if(!['seconds','milliseconds'].includes(c.timestampUnit))missing.push('timestamp_unit');
  if(!['v1','v2'].includes(c.version))missing.push('api_version');
  if(c.baseURL!=='https://test.trackthat.top/')missing.push('vendor_https_url');
  return {ready:!missing.length,canProbe:!missing.some(key=>!['tracker_sn','timestamp_unit','api_version'].includes(key)),missing,loginConfigured:validPasswordHash(c.passwordHash),isDemo:false,hardwareConnected:false,version:'0.3.1',scope:'single-owner-test'};
}
function validPasswordHash(hash) {return /^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/.test(hash);}
function validPassword(password,hash) {
  if(!validPasswordHash(hash)||typeof password!=='string'||password.length<12||password.length>256)return false;
  const [,salt,digest]=hash.split(':');
  return timingSafeEqual(scryptSync(password,Buffer.from(salt,'hex'),64),Buffer.from(digest,'hex'));
}
const hashSession=value=>createHash('sha256').update(value).digest('hex');
const API='/api/mytag/';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json','.txt':'text/plain; charset=utf-8'};
export function createHandler({config=configFromEnv(),vendor=new VendorClient(config),now=()=>Date.now(),staticRoot=existsSync(new URL('../mytag/',import.meta.url))?fileURLToPath(new URL('../',import.meta.url)):fileURLToPath(new URL('../site/dist/',import.meta.url))}={}) {
  const sessions=new Map();let failureWindow=0,failures=0,busy=false,lastVendorAttempt=-Infinity;
  return async (req,res)=>{
    const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Pragma':'no-cache'});res.end(JSON.stringify(data));};
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    let url;try {url=new URL(req.url,'https://local.invalid');}catch{return json(400,{error:'INVALID_REQUEST'});}
    if(!url.pathname.startsWith(API)) {
      if(!['GET','HEAD'].includes(req.method))return json(405,{error:'METHOD_NOT_ALLOWED'});
      let path;try {path=decodeURIComponent(url.pathname);}catch{return json(400,{error:'INVALID_REQUEST'});}
      if(path==='/') {res.writeHead(302,{Location:'/mytag/'});res.end();return;}
      if(!path.startsWith('/mytag/')||path.includes('\\')||path.includes('\0'))return json(404,{error:'NOT_FOUND'});
      if(path.endsWith('/'))path+='index.html';
      const file=resolve(staticRoot,'.'+path),root=resolve(staticRoot,'mytag');
      if(!file.startsWith(root+'/')||!types[extname(file)])return json(404,{error:'NOT_FOUND'});
      try {const content=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)],'Cache-Control':'no-cache','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://narvie-mytag-test.onrender.com; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"});res.end(req.method==='HEAD'?undefined:content);}catch {json(404,{error:'NOT_FOUND'});}
      return;
    }
    res.setHeader('Cache-Control','no-store');
    const origin=req.headers.origin;
    if(origin&&!config.allowedOrigins.includes(origin))return json(403,{error:'ORIGIN_REJECTED'});
    if(origin) {res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
    if(req.method==='OPTIONS') {res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'300'});res.end();return;}
    if(url.search)return json(400,{error:'INVALID_REQUEST'});
    for(const [key,s] of sessions)if(s.expires<=now())sessions.delete(key);
    const route=url.pathname.slice(API.length);
    try {
      if(route==='status'&&req.method==='GET')return json(200,readiness(config));
      if(route==='session'&&req.method==='POST') {
        if(now()-failureWindow>15*60*1000){failureWindow=now();failures=0;}
        if(failures>=5)return json(429,{error:'LOGIN_RATE_LIMITED'});
        if(!validPasswordHash(config.passwordHash))return json(503,{error:'OWNER_LOGIN_NOT_CONFIGURED'});
        if((req.headers['content-type']||'').split(';')[0]!=='application/json')return json(415,{error:'JSON_REQUIRED'});
        const body=await readJSON(req);
        if(!validPassword(body.password,config.passwordHash)){failures++;return json(401,{error:'LOGIN_REJECTED'});}
        if(sessions.size>=20)return json(429,{error:'TOO_MANY_SESSIONS'});
        const token=randomBytes(32).toString('base64url'),expires=now()+30*60*1000;
        sessions.set(hashSession(token),{expires});
        return json(200,{session:token,expiresAt:new Date(expires).toISOString()});
      }
      const header=req.headers.authorization||'';
      const key=/^Bearer [A-Za-z0-9_-]{43}$/.test(header)?hashSession(header.slice(7)):'';
      const session=sessions.get(key);
      if(!session)return json(401,{error:'LOGIN_REQUIRED'});
      if(route==='logout'&&req.method==='POST'){sessions.delete(key);return json(200,{ok:true});}
      if(route==='tracker'&&req.method==='GET')return json(200,{name:config.trackerName,sn:config.sn||null,snVerified:false,isDemo:false,capabilities:{location:readiness(config).ready,bluetooth:false,ring:false,batteryPercentage:false}});
      if(['probe','location'].includes(route)&&req.method==='POST') {
        // Only the server-configured sample. Client cannot enumerate SNs or set vendor URLs.
        if(req.headers['transfer-encoding']||(req.headers['content-length']&&req.headers['content-length']!=='0'))return json(400,{error:'BODY_NOT_ALLOWED'});
        if(!(route==='probe'?readiness(config).canProbe:readiness(config).ready))return json(503,{error:'SERVER_NOT_CONFIGURED'});
        if(busy||now()-lastVendorAttempt<15_000)return json(429,{error:'WAIT_BEFORE_RETRY'});
        busy=true;lastVendorAttempt=now();
        try {
          if(route==='probe'){await vendor.probe();return json(200,{authenticated:true,trackerAssignmentVerified:false,isDemo:false});}
          return json(200,await vendor.location());
        } finally {busy=false;}
      }
      return json(404,{error:'NOT_FOUND'});
    }catch(error){return json(error instanceof IntegrationError?error.status:500,{error:error instanceof IntegrationError?error.code:'INTERNAL_ERROR'});}
  };
}
async function readJSON(req) {
  let size=0;const chunks=[];
  for await (const chunk of req){size+=chunk.length;if(size>2048)throw new IntegrationError('REQUEST_TOO_LARGE',413);chunks.push(chunk);}
  try {const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!data||typeof data!=='object'||Array.isArray(data))throw Error();return data;}catch {throw new IntegrationError('INVALID_REQUEST',400);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const server=createServer(createHandler());
  server.requestTimeout=15_000;server.headersTimeout=10_000;
  server.listen(Number(process.env.PORT)||10000,'0.0.0.0',()=>console.log('Narvie MyTag testserver gestart. Locaties en geheimen worden niet gelogd.'));
}
