import Foundation

/// A versioned bridge to the web editor. Coordinates and lengths are in meters;
/// +Y points up, and the web editor projects X/Z onto its 2D X/Y plane.
struct ScanDocument: Codable, Identifiable {
    let format: String
    let version: Int
    let id: String
    let name: String
    let capturedAt: Date
    let units: String
    let floorY: Double
    let surfaces: [ScanSurface]
    let floors: [ScanFloor]
    let objects: [ScanObject]

    init(id: String = UUID().uuidString.lowercased(), name: String, capturedAt: Date = Date(),
         floorY: Double, surfaces: [ScanSurface], floors: [ScanFloor], objects: [ScanObject]) {
        self.format = "floorplan-scan"
        self.version = 1
        self.id = id
        self.name = String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(100))
        self.capturedAt = capturedAt
        self.units = "m"
        self.floorY = floorY
        self.surfaces = surfaces
        self.floors = floors
        self.objects = objects
    }

    func validate() throws {
        func vector(_ v: [Double]) -> Bool { v.count == 3 && v.allSatisfy { $0.isFinite && abs($0) < 1000 } }
        func axis(_ v: [Double]) -> Bool {
            vector(v) && abs(sqrt(v.reduce(0) { $0 + $1 * $1 }) - 1) < 0.01
        }
        guard format == "floorplan-scan", version == 1, units == "m", UUID(uuidString: id) != nil,
              !name.isEmpty, name.count <= 100, floorY.isFinite,
              surfaces.count <= 2000, floors.count <= 100, objects.count <= 2000,
              surfaces.contains(where: { $0.kind == "wall" }),
              Set(surfaces.map(\.id)).count == surfaces.count,
              Set(objects.map(\.id)).count == objects.count,
              surfaces.allSatisfy({ s in
                  ["wall", "window", "door", "opening"].contains(s.kind) &&
                  vector(s.center) && axis(s.xAxis) && s.width.isFinite && s.width > 0 && s.width < 100 &&
                  s.height.isFinite && s.height > 0 && s.height < 30 &&
                  s.thickness.isFinite && s.thickness >= 0 && s.thickness < 5
              }), floors.allSatisfy({ $0.corners.count >= 3 && $0.corners.count <= 1000 && $0.corners.allSatisfy(vector) }),
              objects.allSatisfy({ vector($0.center) && axis($0.xAxis) && !$0.category.isEmpty &&
                  vector($0.size) && $0.size.allSatisfy { $0 > 0 && $0 < 100 } }) else {
            throw ScanFileError.invalidScan
        }
    }

    static func encoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }
}

struct ScanSurface: Codable, Identifiable {
    let id: String
    let kind: String
    let parentID: String?
    let center: [Double]
    let xAxis: [Double]
    let width: Double
    let height: Double
    let thickness: Double
    let confidence: String
}

struct ScanFloor: Codable, Identifiable {
    let id: String
    /// World-space corners, after applying the RoomPlan surface transform.
    let corners: [[Double]]
}

struct ScanObject: Codable, Identifiable {
    let id: String
    let category: String
    let center: [Double]
    let xAxis: [Double]
    /// Local X width, Y height, Z depth.
    let size: [Double]
    let confidence: String
}

enum ScanFileError: LocalizedError {
    case invalidScan
    var errorDescription: String? { "扫描数据不完整，请确保至少识别出一面墙后重试。" }
}
