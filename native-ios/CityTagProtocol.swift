import Foundation

// Supplier screenshot, 11 Nov 2026. Not yet verified on the owner's sample.
enum CityTagProtocol {
    static let service = "00005301-0000-0041-4c50-574953450000"
    static let write = "00005302-0000-0041-4c50-574953450000"
    static let notify = "00005303-0000-0041-4c50-574953450000"
    enum Command: UInt8 { case serial = 0x50, firmware = 0x32, batteryStart = 0x21, batteryRead = 0x41, ring = 0x42 }
    enum Reply: Equatable { case serial(String), firmware(String), battery(Int), acknowledged }
    static func decode(_ data: Data, for command: Command) -> Reply? {
        let b = Array(data)
        switch command {
        case .serial:
            guard b.count == 12, b.allSatisfy({ (48...57).contains($0) || (65...90).contains($0) || (97...122).contains($0) || $0 == 45 || $0 == 95 }),
                  let sn = String(bytes:b, encoding:.ascii) else { return nil }
            return .serial(sn)
        case .firmware:
            guard b.count == 4, b[0] == 0x82 else { return nil }
            return .firmware("\(b[1]).\(b[2]).\(b[3])")
        case .batteryRead:
            guard b.count == 3, b[0] == 0x82, b[1] == 0, b[2] <= 100 else { return nil }
            return .battery(Int(b[2]))
        case .batteryStart, .ring:
            return b == [0x82,0,0] ? .acknowledged : nil
        }
    }
}
