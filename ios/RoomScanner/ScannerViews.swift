import SwiftUI
import AVFoundation
import RoomPlan
import QuickLook
import UIKit

private let ink = Color(red: 0.12, green: 0.20, blue: 0.22)
private let paper = Color(red: 0.96, green: 0.96, blue: 0.93)

struct ScannerHomeView: View {
    @ObservedObject var scanner: ScannerController
    @State private var selectedArchive: ScanArchive?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 14) {
                        Image(systemName: "viewfinder").font(.system(size: 48, weight: .light)).foregroundStyle(.tint)
                        Text("把房间\n带进设计里。")
                            .font(.system(size: 35, weight: .semibold, design: .rounded)).foregroundStyle(ink)
                        Text("用 iPhone 扫描墙面、门窗与家具，实时生成 3D 房间模型。")
                            .font(.body).foregroundStyle(.secondary)
                        TextField("给这次扫描起个名字", text: $scanner.scanName)
                            .textFieldStyle(.roundedBorder).submitLabel(.done)
                            .accessibilityLabel("扫描名称")
                        Button { Task { await scanner.start() } } label: {
                            Label("开始扫描", systemImage: "camera.viewfinder")
                                .font(.headline).frame(maxWidth: .infinity).padding(.vertical, 10)
                        }.buttonStyle(.borderedProminent).controlSize(.large).disabled(!scanner.supported)
                        if !scanner.supported {
                            Label("扫描需要带 LiDAR 的 iPhone / iPad 真机，模拟器可查看界面。", systemImage: "info.circle")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                    }.padding(24).background(.white, in: RoundedRectangle(cornerRadius: 28))

                    VStack(alignment: .leading, spacing: 10) {
                        Text("扫描前准备").font(.headline)
                        tip("lightbulb", "打开照明，留出行走空间。")
                        tip("rectangle.3.group", "第一版一次扫描一个房间，缓慢扫过地面、墙角和天花板。")
                        tip("ruler", "玻璃、镜子和遮挡可能影响识别，关键尺寸请复核。")
                        tip("internaldrive", "扫描保存在本机，可通过系统分享导出。")
                    }.padding(.horizontal, 6)

                    HStack {
                        Text("我的扫描").font(.title2.bold())
                        Spacer()
                        Text("\(scanner.archives.count) 个").foregroundStyle(.secondary)
                    }
                    if scanner.archives.isEmpty {
                        ContentUnavailableView("还没有扫描", systemImage: "square.stack.3d.up",
                                               description: Text("完成第一次扫描后，模型与测量数据会出现在这里。"))
                    }
                    ForEach(scanner.archives) { archive in
                        Button { selectedArchive = archive } label: {
                            HStack(spacing: 16) {
                                Image(systemName: "cube.transparent").font(.title).frame(width: 46)
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(archive.name).font(.headline).foregroundStyle(ink)
                                    Text("\(archive.wallCount) 面墙 · \(archive.objectCount) 件物体").font(.subheadline).foregroundStyle(.secondary)
                                    Text(archive.capturedAt, style: .date).font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Image(systemName: "chevron.right").foregroundStyle(.secondary)
                            }.padding(18).background(.white, in: RoundedRectangle(cornerRadius: 20))
                        }.buttonStyle(.plain)
                    }
                }.padding(20)
            }
            .background(paper).navigationTitle("户型扫描").navigationBarTitleDisplayMode(.inline)
            .fullScreenCover(isPresented: $scanner.showCapture) { CaptureScreen(scanner: scanner) }
            .sheet(item: $selectedArchive) { archive in
                if let store = scanner.store { ArchiveDetailView(archive: archive, store: store) }
            }
            .alert("需要注意", isPresented: Binding(get: { scanner.errorMessage != nil && !scanner.showCapture },
                                                set: { if !$0 { scanner.errorMessage = nil } })) {
                Button("知道了", role: .cancel) { scanner.errorMessage = nil }
                if AVCaptureDevice.authorizationStatus(for: .video) == .denied {
                    Button("打开设置") { UIApplication.shared.open(URL(string: UIApplication.openSettingsURLString)!) }
                }
            } message: { Text(scanner.errorMessage ?? "") }
        }
    }

    private func tip(_ symbol: String, _ text: String) -> some View {
        Label(text, systemImage: symbol).font(.subheadline).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
    }
}

struct CaptureScreen: View {
    @ObservedObject var scanner: ScannerController

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            RoomCaptureContainer(scanner: scanner).ignoresSafeArea(edges: .bottom)
        }
        .safeAreaInset(edge: .top) {
            HStack {
                Button("返回") { scanner.cancel() }.disabled(scanner.phase == .saving)
                Spacer()
                Text(scanner.phase == .review ? "扫描预览" : "扫描房间").font(.headline)
                Spacer()
                Text("LiDAR").font(.caption.monospaced()).foregroundStyle(.secondary)
            }.padding().background(.regularMaterial)
        }
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 12) {
                HStack(spacing: 20) {
                    Label("\(scanner.wallCount) 面墙", systemImage: "rectangle.split.3x1")
                    Label("\(scanner.objectCount) 件物体", systemImage: "chair")
                }.font(.subheadline)
                Text(scanner.message).font(.subheadline).multilineTextAlignment(.center)
                switch scanner.phase {
                case .scanning:
                    Button { scanner.finish() } label: {
                        Label("完成扫描", systemImage: "checkmark").frame(maxWidth: .infinity).padding(.vertical, 8)
                    }.buttonStyle(.borderedProminent).disabled(scanner.wallCount == 0)
                case .processing, .saving:
                    ProgressView(scanner.phase == .saving ? "正在保存模型…" : "正在生成模型…").padding(8)
                case .review:
                    if scanner.result != nil {
                        Button { Task { await scanner.save() } } label: {
                            Label("保存模型与测量数据", systemImage: "square.and.arrow.down")
                                .frame(maxWidth: .infinity).padding(.vertical, 8)
                        }.buttonStyle(.borderedProminent)
                    }
                case .idle: EmptyView()
                }
            }.padding(20).frame(maxWidth: .infinity).background(.regularMaterial)
        }
        .interactiveDismissDisabled()
        .alert("扫描提示", isPresented: Binding(get: { scanner.errorMessage != nil },
                                            set: { if !$0 { scanner.errorMessage = nil } })) {
            Button("知道了", role: .cancel) { scanner.errorMessage = nil }
        } message: { Text(scanner.errorMessage ?? "") }
    }
}

struct RoomCaptureContainer: UIViewRepresentable {
    let scanner: ScannerController
    func makeUIView(context: Context) -> RoomCaptureView {
        let view = RoomCaptureView(frame: .zero)
        scanner.attach(view)
        return view
    }
    func updateUIView(_ uiView: RoomCaptureView, context: Context) {}
    static func dismantleUIView(_ uiView: RoomCaptureView, coordinator: ()) {
        uiView.delegate = nil
        uiView.captureSession.delegate = nil
        uiView.captureSession.stop()
    }
}

private struct SharedFile: Identifiable { let id = UUID(); let url: URL }

struct ArchiveDetailView: View {
    let archive: ScanArchive
    let store: ScanArchiveStore
    @Environment(\.dismiss) private var dismiss
    @State private var sharedFile: SharedFile?
    @State private var showModel = false
    @State private var document: ScanDocument?
    @State private var readError: String?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Label("\(archive.wallCount) 面墙 · \(archive.openingCount) 个门窗 / 开口 · \(archive.objectCount) 件物体", systemImage: "cube")
                    Text(archive.capturedAt.formatted(date: .abbreviated, time: .shortened)).foregroundStyle(.secondary)
                    if archive.modelAvailable {
                        Button { showModel = true } label: { Label("查看 3D 模型", systemImage: "cube.transparent") }
                    }
                    if let warning = archive.modelWarning { Text("USDZ 导出未完成：\(warning)").font(.caption).foregroundStyle(.secondary) }
                }
                Section("导出") {
                    shareButton("导出到户型网页", symbol: "square.and.arrow.up", filename: "floorplan-scan.json")
                    shareButton("导出 RoomPlan 原始数据", symbol: "doc.text", filename: "roomplan.json")
                    if archive.modelAvailable { shareButton("导出 USDZ 模型", symbol: "cube", filename: "room.usdz") }
                    Text("在系统分享面板中选“存储到文件”或隔空投送，再在户型网页的“文件 → 导入户型 / 方案”中打开 floorplan-scan.json。")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if let document {
                    Section("墙面尺寸 · 扫描估计值") {
                        ForEach(Array(document.surfaces.filter { $0.kind == "wall" }.enumerated()), id: \.element.id) { index, surface in
                            LabeledContent("墙 \(index + 1)", value: "\(mm(surface.width)) × \(mm(surface.height)) mm")
                        }
                    }
                    Section("家具尺寸 · 宽 × 深 × 高") {
                        ForEach(document.objects) { object in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(object.category)
                                Text("\(mm(object.size[0])) × \(mm(object.size[2])) × \(mm(object.size[1])) mm")
                                    .font(.subheadline.monospacedDigit()).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                if let readError { Text(readError).foregroundStyle(.red) }
                Section {
                    Text("扫描适合快速建模。玻璃、镜面、遮挡和识别错误可能影响结果，装修定位和定制尺寸请实测复核。")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle(archive.name).navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("完成") { dismiss() } } }
            .sheet(item: $sharedFile) { file in ShareSheet(url: file.url) }
            .sheet(isPresented: $showModel) { ModelPreview(url: store.file(archive, "room.usdz")) }
            .task {
                do {
                    let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
                    document = try decoder.decode(ScanDocument.self, from: Data(contentsOf: store.file(archive, "floorplan-scan.json")))
                    try document?.validate()
                } catch { document = nil; readError = "无法读取尺寸：\(error.localizedDescription)" }
            }
        }
    }
    private func mm(_ value: Double) -> Int { Int((value * 1000).rounded()) }
    private func shareButton(_ title: String, symbol: String, filename: String) -> some View {
        Button { sharedFile = SharedFile(url: store.file(archive, filename)) } label: { Label(title, systemImage: symbol) }
    }
}

struct ShareSheet: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

struct ModelPreview: UIViewControllerRepresentable {
    let url: URL
    func makeCoordinator() -> Coordinator { Coordinator(url: url) }
    func makeUIViewController(context: Context) -> QLPreviewController {
        let controller = QLPreviewController(); controller.dataSource = context.coordinator; return controller
    }
    func updateUIViewController(_ uiViewController: QLPreviewController, context: Context) {}
    final class Coordinator: NSObject, QLPreviewControllerDataSource {
        let url: URL
        init(url: URL) { self.url = url }
        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem { url as NSURL }
    }
}
