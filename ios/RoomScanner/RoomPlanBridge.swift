import RoomPlan
import simd

extension ScanDocument {
    init(room: CapturedRoom, name: String) {
        func vector(_ v: SIMD3<Float>) -> [Double] { [Double(v.x), Double(v.y), Double(v.z)] }
        func position(_ t: simd_float4x4) -> [Double] { vector(SIMD3(t.columns.3.x, t.columns.3.y, t.columns.3.z)) }
        func axis(_ t: simd_float4x4) -> [Double] { vector(simd_normalize(SIMD3(t.columns.0.x, t.columns.0.y, t.columns.0.z))) }
        func surfaces(_ list: [CapturedRoom.Surface], kind: String) -> [ScanSurface] {
            list.map { s in
                ScanSurface(id: s.identifier.uuidString.lowercased(), kind: kind,
                            parentID: s.parentIdentifier?.uuidString.lowercased(), center: position(s.transform),
                            xAxis: axis(s.transform), width: Double(s.dimensions.x), height: Double(s.dimensions.y),
                            thickness: Double(s.dimensions.z), confidence: String(describing: s.confidence))
            }
        }
        let floors: [ScanFloor] = room.floors.compactMap { floor in
            let w = floor.dimensions.x / 2, h = floor.dimensions.y / 2
            let localCorners: [SIMD3<Float>]
            if floor.polygonCorners.count >= 3 { localCorners = floor.polygonCorners }
            else if w > 0 && h > 0 {
                localCorners = [SIMD3(-w, -h, 0), SIMD3(w, -h, 0), SIMD3(w, h, 0), SIMD3(-w, h, 0)]
            } else { return nil }
            let corners = localCorners.map { p -> [Double] in
                let world = floor.transform * SIMD4<Float>(p.x, p.y, p.z, 1)
                return [Double(world.x), Double(world.y), Double(world.z)]
            }
            return ScanFloor(id: floor.identifier.uuidString.lowercased(), corners: corners)
        }
        let levels = floors.flatMap(\.corners).map { $0[1] }
        let wallBases = room.walls.map { Double($0.transform.columns.3.y - $0.dimensions.y / 2) }
        let candidates = levels.isEmpty ? wallBases : levels
        let floorY = candidates.sorted().dropFirst(candidates.count / 2).first ?? 0
        self.init(name: name, floorY: floorY,
                  surfaces: surfaces(room.walls, kind: "wall") + surfaces(room.windows, kind: "window") +
                    surfaces(room.doors, kind: "door") + surfaces(room.openings, kind: "opening"),
                  floors: floors, objects: room.objects.map { object in
                    ScanObject(id: object.identifier.uuidString.lowercased(), category: String(describing: object.category),
                               center: position(object.transform), xAxis: axis(object.transform),
                               size: vector(object.dimensions), confidence: String(describing: object.confidence))
                  })
    }
}
