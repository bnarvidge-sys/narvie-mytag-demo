// App-facing boundaries. No vendor credentials belong in this directory.
// A demo response is never presented as a hardware or network observation.
export class DemoTrackerService {
  async refresh(trackers) {
    return {trackers, isDemo:true, message:'Voorbeeldgegevens vernieuwd. Er is geen echte locatie opgevraagd.'};
  }
  async ring(tracker) {
    return {isDemo:true, message:`Voorbeeld: ${tracker.name} laten piepen. Er is geen opdracht naar een tracker verstuurd.`};
  }
}

// Intentionally fail closed until ownership/authentication and the protocol are verified.
export class UnconfiguredBluetoothService {
  async connect() { throw new Error('De echte Bluetooth-koppeling is nog niet aangesloten.'); }
  async ring() { throw new Error('De echte Bluetooth-koppeling is nog niet aangesloten.'); }
  async readBattery() { throw new Error('De echte Bluetooth-koppeling is nog niet aangesloten.'); }
}

export class UnconfiguredLocationService {
  async getLocation() { throw new Error('De locatieverbinding is nog niet aangesloten.'); }
}
