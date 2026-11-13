package nl.narvie.mytag;

import org.junit.Test;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;

public class ProtocolTest {
    @Test public void exactSerialRequired(){
        assertEquals("SAMPLE000001",Protocol.decode(Protocol.SERIAL,"SAMPLE000001".getBytes(StandardCharsets.US_ASCII)));
        assertNull(Protocol.decode(Protocol.SERIAL,"1234567890".getBytes(StandardCharsets.US_ASCII)));
        assertNull(Protocol.decode(Protocol.SERIAL,new byte[]{(byte)0x82,0,0}));
        assertNull(Protocol.decode(Protocol.SERIAL,"SAMPLE00000!".getBytes(StandardCharsets.US_ASCII)));
        assertNull(Protocol.decode(Protocol.SERIAL,new byte[12]));
    }
    @Test public void reconnectRejectsOtherTracker(){
        assertTrue(Protocol.matches("SAMPLE000001","SAMPLE000001"));
        assertFalse(Protocol.matches("SAMPLE000001","SAMPLE000002"));
        assertFalse(Protocol.matches("SAMPLE000001",null));
        assertFalse(Protocol.matches(null,"123"));
        assertTrue(Protocol.matches(null,"SAMPLE000001"));
    }
    @Test public void batteryRangeAndFraming(){
        assertEquals(98,Protocol.decode(Protocol.BATTERY_READ,new byte[]{(byte)0x82,0,98}));
        assertEquals(0,Protocol.decode(Protocol.BATTERY_READ,new byte[]{(byte)0x82,0,0}));
        assertEquals(100,Protocol.decode(Protocol.BATTERY_READ,new byte[]{(byte)0x82,0,100}));
        assertNull(Protocol.decode(Protocol.BATTERY_READ,new byte[]{(byte)0x82,0,101}));
        assertNull(Protocol.decode(Protocol.BATTERY_READ,new byte[]{(byte)0x82,1,98}));
        assertNull(Protocol.decode(Protocol.BATTERY_READ,new byte[]{(byte)0x82,0}));
    }
    @Test public void firmwareAndAcknowledgements(){
        assertEquals("0.9.19",Protocol.decode(Protocol.FIRMWARE,new byte[]{(byte)0x82,0,9,0x13}));
        assertNull(Protocol.decode(Protocol.FIRMWARE,new byte[]{(byte)0x82,0,9}));
        assertEquals(Boolean.TRUE,Protocol.decode(Protocol.RING,new byte[]{(byte)0x82,0,0}));
        assertNull(Protocol.decode(Protocol.RING,new byte[]{(byte)0x82,0,1}));
        assertNull(Protocol.decode(99,new byte[]{(byte)0x82,0,0}));
        assertEquals(2000,Protocol.BATTERY_DELAY_MS);
    }
}
