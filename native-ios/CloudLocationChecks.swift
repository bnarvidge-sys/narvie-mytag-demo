import Foundation

@main struct CloudLocationChecks {
    static func main() throws {
        let now = Date(timeIntervalSince1970:1_800_000_000)
        var checks = 0
        func check(_ condition:Bool) { precondition(condition); checks += 1 }
        func observation(_ lat:Double = 52,_ lon:Double = 5,_ time:Date? = nil,_ accuracy:Double? = 50) -> CloudObservation {
            CloudObservation(latitude:lat,longitude:lon,observedAt:time ?? now,accuracy:accuracy,batteryCategory:"high",stale:false)
        }
        check(observation().valid(at:now))
        check(!observation(91).valid(at:now))
        check(!observation(52,181).valid(at:now))
        check(!observation(.nan).valid(at:now))
        check(!observation(52,.infinity).valid(at:now))
        check(!observation(52,5,Date(timeIntervalSince1970:0)).valid(at:now))
        check(!observation(52,5,now.addingTimeInterval(301)).valid(at:now))
        check(!observation(52,5,nil,-1).valid(at:now))
        check(observation(52,5,nil,nil).valid(at:now))
        let good = CloudLocationResult(isDemo:false,source:"supplier-api",state:"observation",observation:observation(),retrievedAt:now)
        check((try? good.validated(at:now)) != nil)
        for item in [
            CloudLocationResult(isDemo:true,source:"supplier-api",state:"observation",observation:observation(),retrievedAt:now),
            CloudLocationResult(isDemo:false,source:"demo",state:"observation",observation:observation(),retrievedAt:now),
            CloudLocationResult(isDemo:false,source:"supplier-api",state:"observation",observation:nil,retrievedAt:now),
            CloudLocationResult(isDemo:false,source:"supplier-api",state:"no_location",observation:observation(),retrievedAt:now),
            CloudLocationResult(isDemo:false,source:"supplier-api",state:"no_location",observation:nil,retrievedAt:now.addingTimeInterval(301))
        ] { check((try? item.validated(at:now)) == nil) }
        check((try? CloudLocationResult(isDemo:false,source:"supplier-api",state:"no_location",observation:nil,retrievedAt:now).validated(at:now)) != nil)
        let tracker = CloudTracker(name:"Test",sn:"SAMPLE000001",assignmentConfirmed:true,isDemo:false)
        check(tracker.hasAccess(to:"SAMPLE000001"))
        check(!tracker.hasAccess(to:"SAMPLE000002"))
        check(!tracker.hasAccess(to:nil))
        check(!CloudTracker(name:"Test",sn:"123",assignmentConfirmed:true,isDemo:false).hasAccess(to:"123"))
        check(!CloudTracker(name:"Test",sn:"SAMPLE000001",assignmentConfirmed:false,isDemo:false).hasAccess(to:"SAMPLE000001"))
        check(!CloudTracker(name:"Test",sn:"SAMPLE000001",assignmentConfirmed:true,isDemo:true).hasAccess(to:"SAMPLE000001"))
        for timestamp in ["2026-11-13T08:01:21.000Z","2026-11-13T08:01:21Z"] {
            let json = "{\"isDemo\":false,\"source\":\"supplier-api\",\"state\":\"observation\",\"observation\":{\"latitude\":52,\"longitude\":5,\"observedAt\":\"\(timestamp)\",\"accuracy\":98,\"batteryCategory\":\"high\",\"stale\":false},\"retrievedAt\":\"\(timestamp)\"}"
            let decoded = try CloudJSON.decoder().decode(CloudLocationResult.self,from:Data(json.utf8))
            check((try? decoded.validated(at:now)) != nil)
        }
        print("\(checks) locatie- en identiteitchecks geslaagd; synthetische testdata.")
    }
}
