package nl.narvie.mytag;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

/** The supplier-confirmed sample profile. No bind/reset/auth/firmware writes. */
public final class Protocol {
    private Protocol() {}
    public static final UUID SERVICE = UUID.fromString("00005301-0000-0041-4c50-574953450000");
    public static final UUID WRITE = UUID.fromString("00005302-0000-0041-4c50-574953450000");
    public static final UUID NOTIFY = UUID.fromString("00005303-0000-0041-4c50-574953450000");
    public static final UUID CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
    public static final int SERIAL=0x50, FIRMWARE=0x32, BATTERY_START=0x21, BATTERY_READ=0x41, RING=0x42;
    public static final int BATTERY_DELAY_MS=2000;
    public static boolean validSerial(String serial) { return serial != null && serial.matches("[A-Za-z0-9_-]{12}"); }
    public static boolean matches(String expected,String actual) { return validSerial(actual) && (expected==null || expected.equals(actual)); }
    public static Object decode(int command,byte[] value) {
        if(value==null)return null;
        if(command==SERIAL) { String sn=new String(value,StandardCharsets.US_ASCII); return value.length==12 && validSerial(sn) ? sn : null; }
        if(command==FIRMWARE) return value.length==4 && (value[0]&255)==0x82 ? (value[1]&255)+"."+(value[2]&255)+"."+(value[3]&255) : null;
        if(command==BATTERY_READ) return value.length==3 && (value[0]&255)==0x82 && value[1]==0 && (value[2]&255)<=100 ? Integer.valueOf(value[2]&255) : null;
        if(command==BATTERY_START || command==RING) return value.length==3 && (value[0]&255)==0x82 && value[1]==0 && value[2]==0 ? Boolean.TRUE : null;
        return null;
    }
}
