import Foundation
import Combine

struct CloudObservation: Decodable, Equatable {
    let latitude: Double
    let longitude: Double
    let observedAt: Date
    let accuracy: Double?
    let batteryCategory: String
    let stale: Bool
    func valid(at now: Date = Date()) -> Bool {
        latitude.isFinite && longitude.isFinite && abs(latitude) <= 90 && abs(longitude) <= 180 &&
        observedAt.timeIntervalSince1970 >= 1_577_836_800 && observedAt <= now.addingTimeInterval(300) &&
        (accuracy.map {$0.isFinite && $0 > 0} ?? true)
    }
}
struct CloudTracker: Decodable {
    let name: String; let sn: String?; let assignmentConfirmed: Bool; let isDemo: Bool
    func hasAccess(to serial:String?) -> Bool {
        guard !isDemo,assignmentConfirmed,let serial,serial == sn else { return false }
        return CityTagProtocol.decode(Data(serial.utf8),for:.serial) != nil
    }
}
struct CloudLocationResult: Decodable {
    let isDemo: Bool
    let source: String
    let state: String
    let observation: CloudObservation?
    let retrievedAt: Date
    func validated(at now: Date = Date()) throws -> CloudLocationResult {
        guard !isDemo, source == "supplier-api", ["observation","no_location"].contains(state),
              (state == "observation") == (observation != nil), observation?.valid(at:now) ?? true,
              retrievedAt.timeIntervalSince1970 >= 1_577_836_800, retrievedAt <= now.addingTimeInterval(300) else { throw CloudFailure.invalidResponse }
        return self
    }
}
enum CloudFailure: Error, LocalizedError {
    case invalidResponse, unavailable, server(String)
    var errorDescription: String? {
        switch self {
        case .invalidResponse: return "De locatiegegevens kunnen nog niet betrouwbaar worden verwerkt. Er is geen nieuwe positie geplaatst."
        case .unavailable: return "De locatieverbinding is tijdelijk niet bereikbaar. Probeer het later opnieuw."
        case .server(let message): return message
        }
    }
}
enum CloudJSON {
    static func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { value in
            let text = try value.singleValueContainer().decode(String.self)
            let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime,.withFractionalSeconds]
            if let date = formatter.date(from:text) { return date }
            formatter.formatOptions = [.withInternetDateTime]
            guard let date = formatter.date(from:text) else { throw CloudFailure.invalidResponse }
            return date
        }
        return decoder
    }
}
private final class NoCloudRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession,task: URLSessionTask,willPerformHTTPRedirection response: HTTPURLResponse,newRequest request: URLRequest,completionHandler: @escaping(URLRequest?)->Void) { completionHandler(nil) }
}
@MainActor final class CloudLocation: ObservableObject {
    @Published private(set) var busy = false
    @Published private(set) var signedIn = false
    @Published private(set) var tracker: CloudTracker?
    @Published private(set) var result: CloudLocationResult?
    @Published private(set) var error: String?
    @Published private(set) var message = "Vraag de laatst waargenomen locatie op."
    private var sessionToken: String?
    private var sessionExpiry: Date?
    private var generation = UUID()
    func observation(for serial: String?) -> CloudObservation? {
        guard signedIn,tracker?.hasAccess(to:serial) == true else { return nil }
        return (try? result?.validated())?.observation
    }
    private let network: URLSession
    private let base = URL(string:"https://narvie-mytag-test.onrender.com/api/mytag/")!
    init() {
        let config = URLSessionConfiguration.ephemeral
        config.urlCache = nil; config.httpCookieStorage = nil; config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 35; config.timeoutIntervalForResource = 90
        network = URLSession(configuration:config,delegate:NoCloudRedirect(),delegateQueue:nil)
    }
    private struct SessionReply: Decodable { let session: String; let expiresAt: Date }
    private struct StatusReply: Decodable { let ready: Bool; let loginConfigured: Bool }
    private struct ErrorReply: Decodable { let error: String }
    private func request<T:Decodable>(_ path: String,method: String = "GET",body: Data? = nil) async throws -> T {
        let requestGeneration = generation
        var req = URLRequest(url:base.appendingPathComponent(path)); req.httpMethod = method
        req.timeoutInterval = path == "status" ? 75 : 35
        req.setValue("application/json",forHTTPHeaderField:"Accept")
        if let sessionToken { req.setValue("Bearer \(sessionToken)",forHTTPHeaderField:"Authorization") }
        if let body { req.httpBody = body; req.setValue("application/json",forHTTPHeaderField:"Content-Type") }
        let data: Data, response: URLResponse
        do { (data,response) = try await network.data(for:req) } catch { throw CloudFailure.unavailable }
        guard let http = response as? HTTPURLResponse, http.url?.scheme == "https",http.url?.host == base.host,
              data.count <= 1_000_000,http.value(forHTTPHeaderField:"Content-Type")?.contains("application/json") == true else { throw CloudFailure.invalidResponse }
        guard (200...299).contains(http.statusCode) else {
            if http.statusCode == 401 && generation == requestGeneration { clearSession() }
            let code = (try? CloudJSON.decoder().decode(ErrorReply.self,from:data))?.error ?? ""
            let text = ["LOGIN_REJECTED":"Het Narvie-wachtwoord klopt niet.","LOGIN_REQUIRED":"Meld je opnieuw aan voor jouw locaties.",
                        "WAIT_BEFORE_RETRY":"Wacht 15 seconden voordat je de locatie opnieuw opvraagt.",
                        "LOGIN_RATE_LIMITED":"Te veel aanmeldpogingen. Probeer over 15 minuten opnieuw.",
                        "VENDOR_UNREACHABLE":"De leveranciersserver reageert nu niet. De lokale Bluetooth-bediening blijft beschikbaar.",
                        "VENDOR_RESPONSE_INVALID":"De leverancier geeft nog een afwijkend locatieantwoord. Er is geen nieuwe positie geplaatst.",
                        "VENDOR_ENCODING_UNVERIFIED":"Het locatieantwoord kan nog niet worden verwerkt.",
                        "VENDOR_ACCESS_REJECTED":"De leverancier geeft nog geen toegang tot deze locatie.",
                        "SERVER_NOT_CONFIGURED":"De locatieverbinding is nog niet volledig ingesteld."]
            throw CloudFailure.server(text[code] ?? "De locatie kon niet worden opgehaald. Probeer het later opnieuw.")
        }
        do { return try CloudJSON.decoder().decode(T.self,from:data) } catch { throw CloudFailure.invalidResponse }
    }
    func login(_ password: String) async {
        guard !busy else { return }; busy = true; error = nil; let id = generation
        defer { if generation == id { busy = false } }
        do {
            let status: StatusReply = try await request("status")
            guard generation == id else { return }
            guard status.loginConfigured else { throw CloudFailure.server("De persoonlijke Narvie-toegang is nog niet ingesteld.") }
            let reply: SessionReply = try await request("session",method:"POST",body:JSONEncoder().encode(["password":password]))
            guard generation == id else { return }
            guard reply.session.range(of:"^[A-Za-z0-9_-]{43}$",options:.regularExpression) != nil,reply.expiresAt > Date() else { throw CloudFailure.invalidResponse }
            sessionToken = reply.session; sessionExpiry = reply.expiresAt
            let tag: CloudTracker = try await request("tracker")
            guard generation == id else { return }
            guard !tag.isDemo,tag.assignmentConfirmed,let sn = tag.sn,CityTagProtocol.decode(Data(sn.utf8),for:.serial) != nil else { clearSession(); throw CloudFailure.invalidResponse }
            tracker = tag; signedIn = true; message = status.ready ? "Klaar om de echte locatie op te vragen." : "De locatieverbinding mist nog een serverinstelling."
        } catch { if generation == id { clearSession(); self.error = error.localizedDescription } }
    }
    func refresh() async {
        guard !busy else { return }
        guard signedIn,let expiry = sessionExpiry,expiry > Date() else { clearSession(); error = "Meld je aan voor jouw locaties."; return }
        busy = true; error = nil; let id = generation
        message = "Laatste waarneming ophalen…"
        defer { if generation == id { busy = false } }
        do {
            let reply: CloudLocationResult = try await request("location",method:"POST")
            guard generation == id else { return }
            result = try reply.validated()
            message = reply.observation == nil ? "Nog geen bruikbare netwerkwaarneming ontvangen." : "Laatste waarneming ontvangen van de leverancier."
        } catch { if generation == id { self.error = error.localizedDescription; message = "Geen nieuwe waarneming ontvangen." } }
    }
    private func clearSession() { sessionToken = nil; sessionExpiry = nil; signedIn = false; tracker = nil; result = nil }
    func logout() async {
        let token = sessionToken
        generation = UUID(); busy = false; clearSession(); error = nil; message = "Je bent afgemeld."
        guard let token else { return }
        var req = URLRequest(url:base.appendingPathComponent("logout")); req.httpMethod = "POST"
        req.setValue("Bearer \(token)",forHTTPHeaderField:"Authorization")
        _ = try? await network.data(for:req)
    }
}
