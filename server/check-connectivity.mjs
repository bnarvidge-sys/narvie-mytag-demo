// Credential-free TLS check, also usable during a hosting build. No HTTP fallback.
const result={host:'test.trackthat.top',credentialsSent:false,httpsConnected:false};
try {
  const response=await fetch('https://test.trackthat.top/',{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(8000)});
  result.httpsConnected=true;result.httpStatus=response.status;
}catch(error){
  const code=error.cause?.code||error.code||error.name;
  result.errorCategory=/^[A-Z0-9_]+$/.test(code||'')?code:'CONNECTION_FAILED';
}
console.log('MyTag credential-free connectivity check: '+JSON.stringify(result));
