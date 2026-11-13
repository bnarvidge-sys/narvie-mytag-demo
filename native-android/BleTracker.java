package nl.narvie.mytag;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.*;
import android.bluetooth.le.*;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import java.util.*;

@SuppressLint("MissingPermission")
public final class BleTracker {
    public static final class Nearby {
        final BluetoothDevice device; final String name,address; final int rssi;
        Nearby(BluetoothDevice d,String n,int r){device=d;name=n;rssi=r;address=d.getAddress();}
    }
    public final Map<String,Nearby> nearby=new LinkedHashMap<>();
    public boolean scanning,connecting,ready,busy;
    public String serial,firmware,expected,status="Voeg jouw eigen tracker toe om te beginnen.";
    public Integer battery;
    public long batteryAt;
    public Runnable changed=()->{};
    private final Context context;
    private final TagStore store;
    private final Handler ui=new Handler(Looper.getMainLooper());
    private BluetoothAdapter adapter;
    private BluetoothGatt active;
    private BluetoothGattCharacteristic writer,notifier;
    private BluetoothLeScanner scanner;
    private Runnable deadline,delay,scanEnd;
    private int pending;
    private long generation;
    private boolean measurement;
    public BleTracker(Context c,TagStore s) {context=c;store=s;BluetoothManager m=c.getSystemService(BluetoothManager.class);adapter=m==null?null:m.getAdapter();}
    public boolean permitted() {
        if(Build.VERSION.SDK_INT>=31)return context.checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN)==PackageManager.PERMISSION_GRANTED && context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)==PackageManager.PERMISSION_GRANTED;
        return context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED;
    }
    private boolean available() {
        if(!permitted()){status="Geef Bluetooth-toestemming via Zoek mijn tracker.";changed.run();return false;}
        if(adapter==null || !adapter.isEnabled()){status="Zet Bluetooth aan en probeer opnieuw.";changed.run();return false;}return true;
    }
    public void scan() {
        if(!available() || connecting || busy)return;
        disconnect();nearby.clear();scanner=adapter.getBluetoothLeScanner();
        if(scanner==null){fail("Bluetooth zoeken is nu niet beschikbaar.");return;}
        scanning=true;status="Zoeken… Kies zelf jouw eigen tracker.";
        try {scanner.startScan(null,new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(),scanCallback);}
        catch(SecurityException | IllegalStateException e){fail("Bluetooth zoeken kon niet starten.");return;}
        scanEnd=()->{stopScan();status="Zoeken afgerond. Een naam of signaal bewijst geen identiteit.";changed.run();};ui.postDelayed(scanEnd,12000);changed.run();
    }
    public void stopScan() {
        if(scanEnd!=null)ui.removeCallbacks(scanEnd);scanEnd=null;
        if(scanner!=null && scanning)try{scanner.stopScan(scanCallback);}catch(SecurityException | IllegalStateException ignored){}
        scanning=false;
    }
    private final ScanCallback scanCallback=new ScanCallback(){
        @Override public void onScanResult(int type,ScanResult result){ui.post(()->{
            if(!scanning || !permitted())return;
            ScanRecord record=result.getScanRecord();String n=record==null?null:record.getDeviceName();
            boolean service=record!=null && record.getServiceUuids()!=null && record.getServiceUuids().stream().anyMatch(u->u.getUuid().equals(Protocol.SERVICE));
            if((n==null || !n.toLowerCase(Locale.ROOT).contains("mytag")) && !service)return;
            BluetoothDevice d=result.getDevice();String address=d.getAddress();
            if(nearby.size()<30 || nearby.containsKey(address)){nearby.put(address,new Nearby(d,n==null?"myTag":n,result.getRssi()));changed.run();}
        });}
        @Override public void onScanFailed(int code){ui.post(()->fail("Zoeken lukte niet. Wacht even en probeer opnieuw."));}
    };
    public void connect(Nearby candidate){connect(candidate.device,null);}
    public void reconnect(TagStore.Tag tag){
        if(!available() || connecting || busy)return;
        try {connect(adapter.getRemoteDevice(tag.address),tag.sn);}catch(IllegalArgumentException e){fail("Zoek jouw tracker opnieuw en controleer het serienummer.");}
    }
    private void connect(BluetoothDevice device,String wanted){
        if(!available())return;disconnect();expected=wanted;connecting=true;status="Verbinding maken en serienummer controleren…";
        try {active=device.connectGatt(context,false,callback,BluetoothDevice.TRANSPORT_LE);}catch(SecurityException e){fail("Bluetooth-toestemming ontbreekt.");return;}
        arm(15000,"Verbinden duurde te lang. Probeer jouw tracker opnieuw te zoeken.");changed.run();
    }
    public void disconnect(){
        generation++;stopScan();cancelDeadline();if(delay!=null)ui.removeCallbacks(delay);delay=null;
        BluetoothGatt previous=active;active=null;writer=null;notifier=null;pending=0;ready=false;busy=false;connecting=false;measurement=false;serial=null;firmware=null;battery=null;batteryAt=0;expected=null;
        if(previous!=null){try{previous.disconnect();}catch(SecurityException ignored){}previous.close();}
        status="Bluetooth-verbinding gesloten. De MyTag-koppeling blijft staan.";
    }
    public void suspend(){disconnect();changed.run();}
    private void fail(String message){disconnect();status=message;changed.run();}
    private void cancelDeadline(){if(deadline!=null)ui.removeCallbacks(deadline);deadline=null;}
    private void arm(long ms,String message){cancelDeadline();long id=generation;deadline=()->{if(id==generation)fail(message);};ui.postDelayed(deadline,ms);}
    public boolean canOperate(String selected){return ready && !busy && Protocol.matches(expected,serial) && Objects.equals(serial,selected);}
    public void send(int command){
        if(!available() || !ready || busy || active==null || writer==null)return;
        if(command!=Protocol.SERIAL && !Protocol.matches(expected,serial))return;
        if(command==Protocol.BATTERY_READ && !measurement)return;
        busy=true;pending=command;status="Wachten op antwoord van jouw tracker…";
        arm(6000,"Geen passend antwoord ontvangen. De verbinding is gesloten; verbind opnieuw.");
        byte[] bytes={(byte)command};boolean sent;
        try {
            if(Build.VERSION.SDK_INT>=33)sent=active.writeCharacteristic(writer,bytes,BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE)==BluetoothStatusCodes.SUCCESS;
            else {writer.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);writer.setValue(bytes);sent=active.writeCharacteristic(writer);}
        }catch(SecurityException e){sent=false;}
        if(!sent){fail("De Bluetooth-opdracht kon niet worden verstuurd.");return;}changed.run();
    }
    public boolean remember(String name,int icon){
        if(!permitted() || !ready || busy || active==null || !Protocol.matches(expected,serial))return false;
        TagStore.Tag t=store.find(serial);if(t==null)t=new TagStore.Tag();
        t.sn=serial;t.address=active.getDevice().getAddress();t.name=name.trim();t.icon=icon;t.firmware=firmware;t.readAt=System.currentTimeMillis();
        if(battery!=null){t.battery=battery;t.batteryAt=batteryAt;}return store.put(t);
    }
    private void rememberRead(){
        TagStore.Tag t=store.find(serial);if(t==null)return;
        if(firmware!=null)t.firmware=firmware;if(battery!=null){t.battery=battery;t.batteryAt=batteryAt;}t.readAt=System.currentTimeMillis();store.put(t);
    }
    private final BluetoothGattCallback callback=new BluetoothGattCallback(){
        @Override public void onConnectionStateChange(BluetoothGatt g,int code,int state){ui.post(()->{
            if(g!=active)return;if(code!=BluetoothGatt.GATT_SUCCESS || state==BluetoothProfile.STATE_DISCONNECTED){fail("Bluetooth is verbroken. De firmware sluit na ongeveer één minuut inactiviteit.");return;}
            if(state==BluetoothProfile.STATE_CONNECTED)try{if(!g.discoverServices())fail("Bluetooth-profiel kon niet worden opgevraagd.");}catch(SecurityException e){fail("Bluetooth-toestemming ontbreekt.");}
        });}
        @Override public void onServicesDiscovered(BluetoothGatt g,int code){ui.post(()->{
            if(g!=active)return;BluetoothGattService service=g.getService(Protocol.SERVICE);
            writer=service==null?null:service.getCharacteristic(Protocol.WRITE);notifier=service==null?null:service.getCharacteristic(Protocol.NOTIFY);
            if(code!=BluetoothGatt.GATT_SUCCESS || writer==null || notifier==null || (writer.getProperties()&BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE)==0 || (notifier.getProperties()&BluetoothGattCharacteristic.PROPERTY_NOTIFY)==0){fail("Dit apparaat heeft niet het bevestigde MyTag-profiel.");return;}
            BluetoothGattDescriptor descriptor=notifier.getDescriptor(Protocol.CCCD);
            if(descriptor==null){fail("De tracker mist het verwachte notificatieprofiel.");return;}
            boolean sent;
            try {
                sent=g.setCharacteristicNotification(notifier,true);
                if(sent && Build.VERSION.SDK_INT>=33)sent=g.writeDescriptor(descriptor,BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)==BluetoothStatusCodes.SUCCESS;
                else if(sent){descriptor.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);sent=g.writeDescriptor(descriptor);}
            }catch(SecurityException e){sent=false;}
            if(!sent)fail("Trackerantwoorden inschakelen is niet gelukt.");
        });}
        @Override public void onDescriptorWrite(BluetoothGatt g,BluetoothGattDescriptor d,int code){ui.post(()->{
            if(g!=active || !d.getUuid().equals(Protocol.CCCD))return;
            if(code!=BluetoothGatt.GATT_SUCCESS){fail("Trackerantwoorden inschakelen is niet gelukt.");return;}
            cancelDeadline();connecting=false;ready=true;send(Protocol.SERIAL);
        });}
        @Override public void onCharacteristicChanged(BluetoothGatt g,BluetoothGattCharacteristic c){byte[] v=c.getValue();if(v!=null)receive(g,c.getUuid(),v.clone());}
        @Override public void onCharacteristicChanged(BluetoothGatt g,BluetoothGattCharacteristic c,byte[] value){receive(g,c.getUuid(),value.clone());}
    };
    private void receive(BluetoothGatt g,UUID uuid,byte[] bytes){ui.post(()->{
        if(g!=active || !Protocol.NOTIFY.equals(uuid) || pending==0)return;int command=pending;Object reply=Protocol.decode(command,bytes);if(reply==null)return;
        cancelDeadline();pending=0;busy=false;
        if(command==Protocol.SERIAL){
            String sn=(String)reply;if(!Protocol.matches(expected,sn)){fail("Het serienummer verschilt van jouw bewaarde tracker. Er is geen piep- of batterijopdracht gestuurd.");return;}
            serial=sn;rememberRead();send(Protocol.FIRMWARE);
        }else if(command==Protocol.FIRMWARE){firmware=(String)reply;rememberRead();send(Protocol.BATTERY_START);
        }else if(command==Protocol.BATTERY_START){
            measurement=true;busy=true;battery=null;batteryAt=0;status="Batterijmeting gestart. Twee seconden wachten…";long id=generation;
            delay=()->{if(id==generation && ready && measurement){busy=false;send(Protocol.BATTERY_READ);}};ui.postDelayed(delay,Protocol.BATTERY_DELAY_MS);
        }else if(command==Protocol.BATTERY_READ){battery=(Integer)reply;batteryAt=System.currentTimeMillis();measurement=false;rememberRead();status="Verbonden. Batterij rechtstreeks via Bluetooth gelezen.";
        }else if(command==Protocol.RING){status="De tracker bevestigt de piepopdracht. Controleer of je drie piepjes hoort.";}
        changed.run();
    });}
}
