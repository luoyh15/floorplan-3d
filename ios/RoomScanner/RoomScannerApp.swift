import SwiftUI

@main
struct RoomScannerApp: App {
    @StateObject private var scanner = ScannerController()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ScannerHomeView(scanner: scanner)
                .tint(Color(red: 0.08, green: 0.42, blue: 0.40))
                .onChange(of: scenePhase) { _, phase in
                    if phase == .background { scanner.handleBackground() }
                }
        }
    }
}
