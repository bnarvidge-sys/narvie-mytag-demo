package nl.narvie.mytag;

import org.json.JSONObject;
import org.junit.Test;
import java.time.Instant;
import static org.junit.Assert.*;

public class CloudClientTest {
    static final long NOW=Instant.parse("2026-11-13T08:10:00Z").toEpochMilli();
    private JSONObject fixture()throws Exception{return new JSONObject("{\"isDemo\":false,\"source\":\"supplier-api\",\"state\":\"observation\",\"retrievedAt\":\"2026-11-13T08:10:00.000Z\",\"observation\":{\"latitude\":52.0,\"longitude\":5.0,\"observedAt\":\"2026-11-13T08:03:50Z\",\"accuracy\":71,\"stale\":false,\"batteryCategory\":\"high\"}}");}
    private void rejects(JSONObject value)throws Exception{try{CloudClient.parseLocation(value,NOW);fail("Invalid location accepted");}catch(Exception expected){assertNotNull(expected);}}
    @Test public void validObservationKeepsBothTimesAndAccuracy()throws Exception{
        CloudClient.Observation o=CloudClient.parseLocation(fixture(),NOW);assertEquals(52,o.latitude,0);assertEquals(5,o.longitude,0);assertEquals(71,o.accuracy,0);assertEquals(NOW,o.retrievedAt);assertTrue(o.observedAt<o.retrievedAt);assertFalse(o.stale);
    }
    @Test public void rejectDemoWrongSourceAndStates()throws Exception{
        rejects(fixture().put("isDemo",true));rejects(fixture().put("source","demo"));rejects(fixture().put("state","no_location"));rejects(fixture().put("state","success"));rejects(fixture().put("observation",JSONObject.NULL));rejects(fixture().put("isDemo","false"));
    }
    @Test public void rejectImpossibleOrStringCoordinates()throws Exception{
        for(Object latitude:new Object[]{91,-91,"52",JSONObject.NULL}){JSONObject root=fixture();root.getJSONObject("observation").put("latitude",latitude);rejects(root);}
        JSONObject root=fixture();root.getJSONObject("observation").put("longitude",181);rejects(root);
    }
    @Test public void rejectZeroFutureAndInvalidTimes()throws Exception{
        for(String date:new String[]{"1970-01-01T00:00:00Z","2026-11-13T09:00:00Z","not-a-date"}){JSONObject root=fixture();root.getJSONObject("observation").put("observedAt",date);rejects(root);}
        rejects(fixture().put("retrievedAt","2026-11-14T08:00:00Z"));
    }
    @Test public void unknownAccuracyNeverInventedAndMissingLocationExplicit()throws Exception{
        JSONObject root=fixture();root.getJSONObject("observation").put("accuracy",JSONObject.NULL);assertNull(CloudClient.parseLocation(root,NOW).accuracy);
        root=fixture();root.getJSONObject("observation").put("accuracy",-1);rejects(root);
        assertNull(CloudClient.parseLocation(fixture().put("state","no_location").put("observation",JSONObject.NULL),NOW));
    }
    @Test public void exactSerialIsolation(){assertTrue(CloudClient.matches("SAMPLE000001","SAMPLE000001"));assertFalse(CloudClient.matches("SAMPLE000001","SAMPLE000002"));assertFalse(CloudClient.matches(null,"SAMPLE000001"));assertFalse(CloudClient.matches("123","123"));}
}
