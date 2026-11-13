package nl.narvie.mytag;

import android.os.Handler;
import android.os.Looper;
import org.json.JSONObject;
import javax.net.ssl.HttpsURLConnection;
import java.io.*;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class CloudClient {
    static final String BASE="https://narvie-mytag-test.onrender.com/api/mytag/";
    public boolean busy,signedIn;
    public String serial,name,error,message="Vraag de laatste netwerkwaarneming op.";
    public Observation observation;
    public Runnable changed=()->{};
    private String session;
    private long expires;
    private volatile long generation;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final Handler ui=new Handler(Looper.getMainLooper());
    public static final class Observation {
        public double latitude,longitude;
        public Double accuracy;
        public long observedAt,retrievedAt;
        public boolean stale;
        public String batteryCategory;
    }
    static final class Failure extends Exception {
        final String safeCode;
        Failure(String code){super(code);safeCode=code;}
    }
    static boolean bool(JSONObject o,String key) throws Exception {
        Object value=o.get(key);if(!(value instanceof Boolean))throw new Failure("INVALID_RESPONSE");return (Boolean)value;
    }
    static double number(JSONObject o,String key) throws Exception {
        Object value=o.get(key);if(!(value instanceof Number))throw new Failure("INVALID_RESPONSE");double n=((Number)value).doubleValue();if(!Double.isFinite(n))throw new Failure("INVALID_RESPONSE");return n;
    }
    static long time(String text,long now) throws Exception {
        long t;try{t=Instant.parse(text).toEpochMilli();}catch(Exception e){throw new Failure("INVALID_RESPONSE");}
        if(t<1577836800000L || t>now+300000)throw new Failure("INVALID_RESPONSE");return t;
    }
    public static Observation parseLocation(JSONObject root,long now) throws Exception {
        if(bool(root,"isDemo") || !"supplier-api".equals(root.getString("source")))throw new Failure("INVALID_RESPONSE");
        long retrieved=time(root.getString("retrievedAt"),now);String state=root.getString("state");
        if("no_location".equals(state)){if(!root.has("observation") || !root.isNull("observation"))throw new Failure("INVALID_RESPONSE");return null;}
        if(!"observation".equals(state))throw new Failure("INVALID_RESPONSE");
        JSONObject value=root.getJSONObject("observation");Observation o=new Observation();o.latitude=number(value,"latitude");o.longitude=number(value,"longitude");
        if(Math.abs(o.latitude)>90 || Math.abs(o.longitude)>180)throw new Failure("INVALID_RESPONSE");
        o.observedAt=time(value.getString("observedAt"),now);o.retrievedAt=retrieved;
        if(!value.has("accuracy"))throw new Failure("INVALID_RESPONSE");
        o.accuracy=value.isNull("accuracy")?null:number(value,"accuracy");if(o.accuracy!=null && o.accuracy<=0)throw new Failure("INVALID_RESPONSE");
        o.stale=bool(value,"stale") || now-o.observedAt>86400000L;
        o.batteryCategory=value.getString("batteryCategory");return o;
    }
    public static boolean matches(String local,String assigned){return Protocol.validSerial(local) && local.equals(assigned);}
    private static JSONObject request(String path,String method,String body,String token) throws Exception {
        HttpsURLConnection connection=(HttpsURLConnection)new URL(BASE+path).openConnection();
        connection.setInstanceFollowRedirects(false);connection.setUseCaches(false);connection.setConnectTimeout(path.equals("status")?75000:35000);connection.setReadTimeout(path.equals("status")?75000:35000);
        connection.setRequestMethod(method);connection.setRequestProperty("Accept","application/json");connection.setRequestProperty("Cache-Control","no-store");
        if(token!=null)connection.setRequestProperty("Authorization","Bearer "+token);
        try {
            if(body!=null){byte[] data=body.getBytes(StandardCharsets.UTF_8);connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");connection.setFixedLengthStreamingMode(data.length);try(OutputStream out=connection.getOutputStream()){out.write(data);}}
            int status=connection.getResponseCode();String type=connection.getContentType();
            if(status>=300 && status<400)throw new Failure("INVALID_RESPONSE");
            if(type==null || !type.toLowerCase(Locale.ROOT).startsWith("application/json"))throw new Failure("INVALID_RESPONSE");
            InputStream input=status>=200 && status<300 ? connection.getInputStream() : connection.getErrorStream();
            if(input==null)throw new Failure("INVALID_RESPONSE");
            ByteArrayOutputStream output=new ByteArrayOutputStream();try(InputStream in=input){byte[] buffer=new byte[8192];int read;while((read=in.read(buffer))!=-1){if(output.size()+read>1000000)throw new Failure("INVALID_RESPONSE");output.write(buffer,0,read);}}
            JSONObject result=new JSONObject(output.toString(StandardCharsets.UTF_8.name()));
            if(status<200 || status>=300)throw new Failure(result.optString("error","UNAVAILABLE"));return result;
        } finally {connection.disconnect();}
    }
    public void login(String password){
        if(busy)return;busy=true;error=null;long id=generation;changed.run();
        worker.execute(()->{
            try {
                JSONObject status=request("status","GET",null,null);
                if(!bool(status,"loginConfigured"))throw new Failure("SERVER_NOT_CONFIGURED");
                JSONObject auth=request("session","POST",new JSONObject().put("password",password).toString(),null);
                String token=auth.getString("session");long expiry=time(auth.getString("expiresAt"),System.currentTimeMillis()+1800000L);
                if(!token.matches("[A-Za-z0-9_-]{43}") || expiry<=System.currentTimeMillis())throw new Failure("INVALID_RESPONSE");
                JSONObject tracker=request("tracker","GET",null,token);String sn=tracker.getString("sn"),label=tracker.getString("name");
                if(bool(tracker,"isDemo") || !bool(tracker,"assignmentConfirmed") || !Protocol.validSerial(sn) || label.length()>200)throw new Failure("INVALID_RESPONSE");
                ui.post(()->{if(id!=generation)return;session=token;expires=expiry;serial=sn;name=label;signedIn=true;busy=false;message="Klaar om de locatie te vernieuwen.";changed.run();refresh();});
            }catch(Exception e){ui.post(()->{if(id!=generation)return;clear();busy=false;error=safe(e);changed.run();});}
        });
    }
    public void refresh(){
        if(busy)return;if(!signedIn || expires<=System.currentTimeMillis()){clear();error="Meld je opnieuw aan voor jouw locaties.";changed.run();return;}
        busy=true;error=null;message="Laatste netwerkwaarneming ophalen…";long id=generation;String token=session;changed.run();
        worker.execute(()->{try {
            Observation value=parseLocation(request("location","POST",null,token),System.currentTimeMillis());
            ui.post(()->{if(id!=generation)return;busy=false;observation=value;message=value==null?"Nog geen bruikbare netwerkwaarneming ontvangen.":"Laatste waarneming ontvangen van de leverancier.";changed.run();});
        }catch(Exception e){ui.post(()->{if(id!=generation)return;busy=false;if(e instanceof Failure && ((Failure)e).safeCode.equals("LOGIN_REQUIRED"))clear();error=safe(e);message="Geen nieuwe waarneming ontvangen.";changed.run();});}});
    }
    public Observation forSerial(String local){return signedIn && matches(local,serial) ? observation : null;}
    private void clear(){session=null;expires=0;signedIn=false;serial=null;name=null;observation=null;}
    public void logout(){String old=session;generation++;busy=false;clear();error=null;message="Je bent afgemeld.";changed.run();if(old!=null)worker.execute(()->{try{request("logout","POST",null,old);}catch(Exception ignored){}});}
    public void close(){generation++;clear();worker.shutdownNow();}
    private static String safe(Exception error){
        String code=error instanceof Failure?((Failure)error).safeCode:"UNAVAILABLE";
        switch(code){
            case "LOGIN_REJECTED":return "Het Narvie-wachtwoord klopt niet.";
            case "LOGIN_REQUIRED":return "Meld je opnieuw aan voor jouw locaties.";
            case "WAIT_BEFORE_RETRY":return "Wacht 15 seconden voordat je opnieuw vernieuwt.";
            case "LOGIN_RATE_LIMITED":return "Te veel aanmeldpogingen. Probeer over 15 minuten opnieuw.";
            case "VENDOR_ACCESS_REJECTED":return "De leverancier geeft nog geen toegang tot deze locatie.";
            case "SERVER_NOT_CONFIGURED":return "De locatieverbinding mist nog een serverinstelling.";
            case "INVALID_RESPONSE":case "VENDOR_RESPONSE_INVALID":return "Het locatieantwoord kan niet betrouwbaar worden verwerkt. Er is geen nieuwe pin geplaatst.";
            default:return "De locatieverbinding is tijdelijk niet bereikbaar. Bluetooth blijft lokaal beschikbaar.";
        }
    }
}
