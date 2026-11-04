import Foundation

func expect(_ condition: @autoclosure () -> Bool, _ message: String) throws {
    if !condition() { throw NSError(domain: "RoomScannerTests", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
}

let fixture = URL(fileURLWithPath: CommandLine.arguments[1])
let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
let document = try decoder.decode(ScanDocument.self, from: Data(contentsOf: fixture))
try document.validate()
try expect(document.surfaces.count == 6 && document.objects.count == 1, "fixture counts")
let roundTrip = try decoder.decode(ScanDocument.self, from: ScanDocument.encoder().encode(document))
try expect(roundTrip.objects[0].size == [2, 0.8, 0.8], "preserve width/height/depth")
try expect(roundTrip.floors[0].corners == document.floors[0].corners, "preserve concave-capable floor polygon")

let temporary = FileManager.default.temporaryDirectory.appendingPathComponent("room-scanner-tests-" + UUID().uuidString)
defer { try? FileManager.default.removeItem(at: temporary) }
let store = try ScanArchiveStore(root: temporary)
let folder = try store.prepare(document)
let incomplete = try store.list()
try expect(incomplete.isEmpty, "partial scans must not appear in library")
try Data("{}".utf8).write(to: folder.appendingPathComponent("roomplan.json"))
let archive = try store.complete(document, modelAvailable: false, modelWarning: "test export failure")
let list = try store.list()
try expect(list.count == 1 && list[0].id == document.id, "saved scan is reloadable")
try expect(list[0].wallCount == 4 && list[0].openingCount == 2, "archive summary")
try expect(!list[0].modelAvailable && list[0].modelWarning != nil, "JSON remains available after USDZ failure")
try expect(store.file(archive, "floorplan-scan.json").lastPathComponent == "floorplan-scan.json", "share path")

var invalid = try JSONSerialization.jsonObject(with: Data(contentsOf: fixture)) as! [String: Any]
invalid["units"] = "mm"
let bad = try decoder.decode(ScanDocument.self, from: JSONSerialization.data(withJSONObject: invalid))
do { try bad.validate(); throw NSError(domain: "RoomScannerTests", code: 2) }
catch ScanFileError.invalidScan {}
print("RoomScanner core: serialization, units, dimensions, archive persistence and partial-export recovery passed.")
