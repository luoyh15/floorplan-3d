import AVFoundation
import Combine
import RoomPlan
import UIKit

@MainActor
final class ScannerController: NSObject, ObservableObject, @preconcurrency RoomCaptureViewDelegate,
                               RoomCaptureSessionDelegate {
    enum Phase: Equatable { case idle, scanning, processing, review, saving }
    @Published var phase: Phase = .idle
    @Published var showCapture = false
    @Published var message = "缓慢移动手机，依次扫描墙面、墙角和家具。"
    @Published var errorMessage: String?
    @Published var archives: [ScanArchive] = []
    @Published var wallCount = 0
    @Published var objectCount = 0
    @Published var result: ScanDocument?
    @Published var scanName = "房间扫描"

    let supported = RoomCaptureSession.isSupported
    private(set) var store: ScanArchiveStore?
    private var captureView: RoomCaptureView?
    private var capturedRoom: CapturedRoom?
    private var processingTimeout: Task<Void, Never>?

    override init() {
        super.init()
        do { store = try ScanArchiveStore(); try reload() }
        catch { errorMessage = "无法读取扫描文件：\(error.localizedDescription)" }
    }

    required init?(coder: NSCoder) { super.init() }
    func encode(with coder: NSCoder) {}

    func reload() throws { archives = try store?.list() ?? [] }

    func start() async {
        guard phase == .idle, !showCapture else { return }
        guard supported else { errorMessage = "这台设备不支持 RoomPlan。请使用带 LiDAR 的 iPhone 或 iPad 真机。"; return }
        guard store != nil else { errorMessage = "扫描文件夹不可用，请重新启动应用。"; return }
        let granted: Bool
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: granted = true
        case .notDetermined: granted = await AVCaptureDevice.requestAccess(for: .video)
        default: granted = false
        }
        guard granted else { errorMessage = "请到系统设置中允许本应用使用相机，然后重试。"; return }
        guard phase == .idle, !showCapture else { return }
        errorMessage = nil
        result = nil; capturedRoom = nil; wallCount = 0; objectCount = 0
        message = "缓慢移动手机，依次扫描墙面、墙角和家具。"
        phase = .scanning; showCapture = true
    }

    func attach(_ view: RoomCaptureView) {
        guard phase == .scanning else { return }
        captureView = view
        view.delegate = self
        view.captureSession.delegate = self
        view.captureSession.run(configuration: RoomCaptureSession.Configuration())
    }

    func finish() {
        guard phase == .scanning, captureView != nil else { return }
        phase = .processing; message = "正在整理墙体和家具，生成可旋转的 3D 预览…"
        captureView?.captureSession.stop()
        processingTimeout?.cancel()
        processingTimeout = Task { [weak self] in
            try? await Task.sleep(for: .seconds(60))
            guard !Task.isCancelled, let self, self.phase == .processing else { return }
            self.fail("处理耗时过长，请返回后重新扫描较小的区域。")
        }
    }

    func handleBackground() {
        if phase == .scanning { finish() }
    }

    func cancel() {
        guard phase != .saving else { return }
        processingTimeout?.cancel(); processingTimeout = nil
        captureView?.delegate = nil
        captureView?.captureSession.delegate = nil
        captureView?.captureSession.stop()
        captureView = nil; capturedRoom = nil; result = nil
        phase = .idle; showCapture = false
    }

    func detach(_ view: RoomCaptureView) {
        view.delegate = nil; view.captureSession.delegate = nil; view.captureSession.stop()
        if captureView === view { captureView = nil }
    }

    private func fail(_ text: String) {
        processingTimeout?.cancel(); processingTimeout = nil
        phase = .review
        message = "本次扫描未完成，请返回后重试。"
        errorMessage = text
    }

    func save() async {
        guard phase == .review, let room = capturedRoom, let document = result, let store else { return }
        phase = .saving
        do {
            let directory = try store.prepare(document)
            try ScanDocument.encoder().encode(room).write(to: directory.appendingPathComponent("roomplan.json"), options: .atomic)
            // USDZ export is synchronous; keep it off the main thread so the progress UI remains responsive.
            let modelWarning = await Task.detached(priority: .userInitiated) { () -> String? in
                do { try room.export(to: directory.appendingPathComponent("room.usdz"), exportOptions: .mesh); return nil }
                catch { return error.localizedDescription }
            }.value
            _ = try store.complete(document, modelAvailable: modelWarning == nil, modelWarning: modelWarning)
            try reload()
            phase = .review
            cancel()
            if modelWarning != nil { errorMessage = "户型数据已保存，USDZ 模型导出失败。仍可导出网页 JSON 和 RoomPlan 原始 JSON。" }
        } catch {
            phase = .review
            errorMessage = "保存失败，可再次尝试：\(error.localizedDescription)"
        }
    }

    func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool {
        guard showCapture, phase == .processing || phase == .scanning else { return false }
        if let error { fail(error.localizedDescription); return false }
        return true
    }

    func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
        guard showCapture, phase == .processing || phase == .scanning else { return }
        processingTimeout?.cancel(); processingTimeout = nil
        if let error { fail(error.localizedDescription); return }
        let title = scanName.trimmingCharacters(in: .whitespacesAndNewlines)
        let document = ScanDocument(room: processedResult, name: title.isEmpty ? "房间扫描" : title)
        do {
            try document.validate()
            capturedRoom = processedResult; result = document
            wallCount = processedResult.walls.count; objectCount = processedResult.objects.count
            phase = .review; message = "扫描完成。可旋转、缩放模型，确认后保存到本机。"
        } catch { fail(error.localizedDescription) }
    }

    nonisolated func captureSession(_ session: RoomCaptureSession, didUpdate room: CapturedRoom) {
        Task { @MainActor [weak self] in self?.update(session, room) }
    }
    nonisolated func captureSession(_ session: RoomCaptureSession, didAdd room: CapturedRoom) {
        Task { @MainActor [weak self] in self?.update(session, room) }
    }
    nonisolated func captureSession(_ session: RoomCaptureSession, didChange room: CapturedRoom) {
        Task { @MainActor [weak self] in self?.update(session, room) }
    }
    nonisolated func captureSession(_ session: RoomCaptureSession, didRemove room: CapturedRoom) {
        Task { @MainActor [weak self] in self?.update(session, room) }
    }

    private func update(_ session: RoomCaptureSession, _ room: CapturedRoom) {
        guard phase == .scanning, session === captureView?.captureSession else { return }
        wallCount = room.walls.count; objectCount = room.objects.count
    }

    nonisolated func captureSession(_ session: RoomCaptureSession, didProvide instruction: RoomCaptureSession.Instruction) {
        let instructionName = String(describing: instruction)
        Task { @MainActor [weak self] in self?.provideInstruction(instructionName, session: session) }
    }

    private func provideInstruction(_ instruction: String, session: RoomCaptureSession) {
        guard phase == .scanning, session === captureView?.captureSession else { return }
        switch instruction {
        case "moveCloseToWall": message = "请稍微靠近墙面，让手机识别墙角。"
        case "moveAwayFromWall": message = "请稍微远离墙面，留出扫描距离。"
        case "slowDown": message = "请放慢移动速度。"
        case "turnOnLight": message = "光线偏暗，请打开房间照明。"
        case "lowTexture": message = "请转向有纹理的墙角或家具，帮助手机定位。"
        default: message = "缓慢移动手机，扫到地面、墙角和天花板。"
        }
    }

    nonisolated func captureSession(_ session: RoomCaptureSession, didEndWith data: CapturedRoomData, error: Error?) {
        let errorText = error?.localizedDescription
        Task { @MainActor [weak self] in
            guard let self, session === self.captureView?.captureSession,
                  self.phase == .scanning || self.phase == .processing else { return }
            if let errorText { self.fail(errorText) }
        }
    }
}
