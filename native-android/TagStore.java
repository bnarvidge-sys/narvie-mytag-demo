package nl.narvie.mytag;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

public final class TagStore {
    private final SharedPreferences prefs;
    public final List<Tag> tags = new ArrayList<>();
    public static final String[] ICONS={"Tas","Fiets","Sleutels","Koffer","Huisdier","Rugzak"};
    public static final class Tag {
        public String sn,address,name,firmware;
        public int icon;
        public Integer battery;
        public long batteryAt,readAt;
        public boolean valid() {
            return Protocol.validSerial(sn) && address!=null && address.matches("(?i)[0-9a-f]{2}(:[0-9a-f]{2}){5}") && name!=null && !name.trim().isEmpty() && name.length()<=60 && icon>=0 && icon<ICONS.length &&
                (firmware==null || firmware.matches("[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}")) && readAt>=1577836800000L && (battery==null || (battery>=0 && battery<=100 && batteryAt>=1577836800000L));
        }
    }
    public TagStore(Context context) {
        prefs=context.getSharedPreferences("nl.narvie.mytag.savedTrackers.v1",Context.MODE_PRIVATE);
        try {
            JSONObject envelope=new JSONObject(prefs.getString("saved","{}"));
            if(envelope.getInt("version")!=1)return;
            JSONArray records=envelope.getJSONArray("trackers"); if(records.length()>100)return;
            List<Tag> loaded=new ArrayList<>();
            for(int i=0;i<records.length();i++) {
                JSONObject j=records.getJSONObject(i); Tag t=new Tag(); t.sn=j.getString("sn");t.address=j.getString("address");t.name=j.getString("name");t.icon=j.getInt("icon");t.firmware=j.isNull("firmware")?null:j.getString("firmware");
                t.battery=j.isNull("battery")?null:j.getInt("battery");t.batteryAt=j.optLong("batteryAt",0);t.readAt=j.getLong("readAt");
                if(!t.valid() || loaded.stream().anyMatch(x->x.sn.equals(t.sn)))return; loaded.add(t);
            }
            tags.addAll(loaded);
        } catch(Exception ignored) { /* Corrupt saved records never become telemetry. */ }
    }
    public Tag find(String sn) { for(Tag t:tags)if(t.sn.equals(sn))return t;return null; }
    public boolean put(Tag tag) {
        if(!tag.valid() || (tags.size()>=100 && find(tag.sn)==null))return false;
        Tag previous=find(tag.sn); if(previous!=null)tags.remove(previous);tags.add(tag);return persist();
    }
    public void remove(String sn) { tags.removeIf(t->t.sn.equals(sn));persist(); }
    private boolean persist() {
        try {
            JSONArray a=new JSONArray();
            for(Tag t:tags) {
                JSONObject j=new JSONObject();j.put("sn",t.sn);j.put("address",t.address);j.put("name",t.name);j.put("icon",t.icon);j.put("firmware",t.firmware==null?JSONObject.NULL:t.firmware);j.put("battery",t.battery==null?JSONObject.NULL:t.battery);j.put("batteryAt",t.batteryAt);j.put("readAt",t.readAt);a.put(j);
            }
            return prefs.edit().putString("saved",new JSONObject().put("version",1).put("trackers",a).toString()).commit();
        } catch(Exception ignored) {return false;}
    }
}
