import Foundation

@main struct ProtocolChecks {
    static func main() {
        precondition(CityTagProtocol.decode(Data("SAMPLE000001".utf8),for:.serial) == .serial("SAMPLE000001"))
        precondition(CityTagProtocol.decode(Data("1234567890".utf8),for:.serial) == nil)
        precondition(CityTagProtocol.decode(Data([0x82,0,0]),for:.serial) == nil)
        precondition(CityTagProtocol.decode(Data([0x82,0,100]),for:.batteryRead) == .battery(100))
        precondition(CityTagProtocol.decode(Data([0x82,0,0]),for:.batteryRead) == .battery(0))
        precondition(CityTagProtocol.decode(Data([0x82,0,101]),for:.batteryRead) == nil)
        precondition(CityTagProtocol.decode(Data([0x82,1,50]),for:.batteryRead) == nil)
        precondition(CityTagProtocol.decode(Data([0x82,0,0]),for:.ring) == .acknowledged)
        precondition(CityTagProtocol.decode(Data([0x82,0,1]),for:.ring) == nil)
        precondition(CityTagProtocol.decode(Data([0x82,0,0,3]),for:.firmware) == .firmware("0.0.3"))
        precondition(CityTagProtocol.decode(Data([0x82,0,0]),for:.firmware) == nil)
        precondition(CityTagProtocol.decode(Data([0x82,0,0,3,4]),for:.firmware) == nil)
        precondition(CityTagProtocol.decode(Data([0x82,0,9,0x13]),for:.firmware) == .firmware("0.9.19"))
        precondition(CityTagProtocol.batteryDelayMilliseconds == 2000)
        print("14 protocolchecks geslaagd. Testdata en leveranciersvector; geen hardwaretest.")
    }
}
