import Foundation

struct ScanArchive: Codable, Identifiable {
    let id: String
    let name: String
    let capturedAt: Date
    let wallCount: Int
    let openingCount: Int
    let objectCount: Int
    let modelAvailable: Bool
    let modelWarning: String?
}

/// Each scan has its own folder. The manifest is written last so an interrupted
/// export never appears as a complete item in the library.
struct ScanArchiveStore {
    let root: URL

    init(root: URL? = nil) throws {
        let base = try root ?? FileManager.default.url(for: .documentDirectory, in: .userDomainMask,
                                                       appropriateFor: nil, create: true)
            .appendingPathComponent("Scans", isDirectory: true)
        self.root = base
        try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
    }

    func folder(_ id: String) -> URL { root.appendingPathComponent(id, isDirectory: true) }
    func file(_ archive: ScanArchive, _ name: String) -> URL { folder(archive.id).appendingPathComponent(name) }

    func prepare(_ document: ScanDocument) throws -> URL {
        try document.validate()
        let directory = folder(document.id)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try ScanDocument.encoder().encode(document).write(to: directory.appendingPathComponent("floorplan-scan.json"), options: .atomic)
        return directory
    }

    func complete(_ document: ScanDocument, modelAvailable: Bool, modelWarning: String?) throws -> ScanArchive {
        let archive = ScanArchive(id: document.id, name: document.name, capturedAt: document.capturedAt,
                                  wallCount: document.surfaces.filter { $0.kind == "wall" }.count,
                                  openingCount: document.surfaces.filter { $0.kind != "wall" }.count,
                                  objectCount: document.objects.count, modelAvailable: modelAvailable,
                                  modelWarning: modelWarning)
        try JSONEncoder().encode(archive).write(to: folder(document.id).appendingPathComponent("manifest.json"), options: .atomic)
        return archive
    }

    func list() throws -> [ScanArchive] {
        let directories = try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)
        return directories.compactMap { url -> ScanArchive? in
            guard let data = try? Data(contentsOf: url.appendingPathComponent("manifest.json")),
                  let archive = try? JSONDecoder().decode(ScanArchive.self, from: data),
                  UUID(uuidString: archive.id) != nil,
                  url.lastPathComponent == archive.id,
                  FileManager.default.fileExists(atPath: url.appendingPathComponent("floorplan-scan.json").path) else { return nil }
            return archive
        }.sorted { $0.capturedAt > $1.capturedAt }
    }
}
