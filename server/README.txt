NARVIE MYTAG - PERSOONLIJKE TRACKERTEST 0.3.0

Geen GPS666-code, geen bestaande MyTag-aanmelding en geen tracker-reset.
Deze backend kan één vooraf ingestelde eigen tracker bevragen. Klantenaccounts,
trackerregistratie/activering, overdracht, native BLE en achtergrondmeldingen
zijn nog niet geïmplementeerd. Dit is geen complete MyTag-vervanger.

START
Node >=22; geen npm-dependencies nodig. Root van publicatierepository bevat
mytag/ en server/. Start: node server/app.mjs. Render: gratis Web Service,
build: node server/check-connectivity.mjs. Eigen dienst narvie-mytag-test;
de bestaande narvie-mytag-demo blijft het adres van het telefoonicoon.
De frontend gebruikt HTTPS, CORS en een uitsluitend in geheugen bewaarde
Bearer-sessie om deze eigen backend te benaderen. Geen third-party cookies.
Render Free kan bij inactiviteit slapen; een eerste verzoek kan traag zijn.

SERVERINSTELLINGEN (alleen hosting-omgeving, nooit frontend of GitHub)
MYTAG_BASE_URL=https://test.trackthat.top/
MYTAG_MERCHANT_TOKEN=<bestaand testtoken van leverancier>
MYTAG_TEST_SN=<exact API-SN of uitdrukkelijk gekozen labelcode als testkandidaat>
MYTAG_TEST_NAME=Mijn Narvie-testtracker
NARVIE_OWNER_PASSWORD_HASH=<uit create-password-hash.py>
NARVIE_ALLOWED_ORIGINS=https://narvie-mytag-demo.onrender.com,https://narvie-mytag-test.onrender.com
MYTAG_CODEC_PROFILE=md5hex-ascii24-base64
MYTAG_REQUEST_TIMEZONE=<bevestigde tijdzone, bijvoorbeeld UTC of Asia/Shanghai>
MYTAG_TIMESTAMP_UNIT=<seconds of milliseconds, leverancier bevestigt eenheid>
MYTAG_API_VERSION=v1

Het wachtwoord kiest de gebruiker zelf. Voer create-password-hash.py in een
terminal uit; de invoer is verborgen. Alleen de resulterende scrypt-hash in
Render zetten. Het wachtwoord nooit in broncode, logs of URL plaatsen.
De demo vraagt niet om een MyTag-wachtwoord of een leverancierstoken.

PROTOCOLSTATUS
Volledig gelezen: CityTag BLE Instructions 20260826 (2 pagina's) en
Tag Data Protocol v2.3.3 EN (10 pagina's).
De codec volgt 3DES ECB met PKCS7, MD5 hex laatste 24 tekens als ASCII-key,
UTF-8 JSON en Base64 ciphertext met 16 alfanumerieke random tekens achteraan.
De PDF geeft GEEN testvector die ASCII/encoding/Base64 definitief bevestigt.
Daarom moet dit profiel expliciet worden gekozen; het is niet bewezen tegen
de leveranciersserver. Geen automatisch proberen van afwijkende coderingen.
Ook tijdzone en epoch-eenheid expliciet instellen. timestamp=0, ongeldige of
toekomstige waarnemingen worden niet als een actuele locatie weergegeven.
Een API-batterijcategorie wordt niet naar een percentage omgerekend.

TESTVERLOOP
1. GET /api/mytag/status: openbare, niet-gevoelige configuratiestatus.
2. POST /api/mytag/session: persoonlijk testwachtwoord -> 30-minutensessie.
3. GET /api/mytag/tracker: alleen de serveringestelde tracker.
4. POST /api/mytag/probe: GTagToken. Succes bewijst alleen tokenacceptatie.
5. POST /api/mytag/location: GTagToken gevolgd door GTagGps. Geen client-SN.
6. POST /api/mytag/logout: sessie intrekken; opnieuw openen vereist aanmelding.

Geen echte token/SN-verzoeken uitgevoerd vóór veilige configuratie. De code
herstelt, bindt of activeert de tracker niet. Een labelcode kan een andere
waarde zijn dan het API-SN; nooit met nullen aanvullen. De leverancier bepaalt
of activering/toewijzing/registratie nodig is. Het ontbreken van MyTag-koppeling
is op zichzelf geen bewijs dat de tracker via de API toegankelijk is.

BEPERKINGEN EN BEVEILIGING
- Geen HTTP-fallback, onbekende host of redirects voor geheime verzoeken.
- Uitsluitend één eigen SN; geen publieke zoekfunctie op willekeurige codes.
- Scrypt-wachtwoordhash, sessies gehasht in servergeheugen, loginlimiet.
- Leveranciersverzoeken beperkt tot één per 15 seconden; geen achtergrondpolling.
- Alle API-antwoorden no-store; niet in SW of browseropslag opslaan.
- API-fouten worden gefilterd; geen vendorbody of geheimen in foutmeldingen.
- Geen persistente database; herstart trekt testsessies in.
- Native BLE vereist nog GATT-UUID's, profiel/modelbevestiging, native module,
  Xcode voor iOS/signing en echte toesteltests. Capacitor-config is geen build.

Het token en het echte labelnummer zijn bewust afwezig in deze repository.
