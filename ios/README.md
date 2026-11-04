# 户型扫描 · iOS

基于 Apple RoomPlan 的单房间扫描应用，配合本仓库的户型网页使用。支持 iPhone 17 Pro 等带 LiDAR 的 iPhone / iPad，最低 iOS / iPadOS 17。代码使用系统框架，没有第三方依赖和模型 API Key。

## 已实现

- 相机权限与 LiDAR 能力检查；不支持的设备显示说明。
- 使用系统 RoomCaptureView 实时扫描、显示空间重建结果和扫描引导。
- 实时显示墙面与物体数量；结束后查看、旋转和缩放 3D 房间。
- 扫描命名、本机保存、历史列表、墙面尺寸和家具宽 / 深 / 高列表。
- 导出 USDZ 模型、完整 RoomPlan JSON，以及网页可导入的 `floorplan-scan.json`。
- USDZ 导出失败时保留可用的 JSON，并明确显示提示。
- 相机中断 / 进入后台时结束当前扫描并尝试处理已有结果；处理超时可返回重试。
- 扫描数据仅写入应用的 Documents/Scans。系统分享由用户主动发起；应用没有上传接口、账号或追踪 SDK。

这是参数化房间和物体尺寸扫描。细节家具网格、摄影测量、贴图重建、整屋多房间拼接、施工测绘精度验证未包含在这一版中。

## 在 iPhone 上运行

1. 在 Mac 安装完整 Xcode。连接 iPhone 17 Pro 时，使用支持手机当前 iOS 版本的 Xcode（iOS 26 对应 Xcode 26 或更新版本）。仅安装 Command Line Tools 不能构建 iOS App。
2. 打开 `ios/RoomScanner.xcodeproj`，选择 `RoomScanner` scheme。
3. 在 target 的 **Signing & Capabilities** 中选择自己的 Development Team。若示例 Bundle Identifier 被占用，把 `com.luoyh.floorplan.scanner` 改为自己的唯一标识。
4. USB 连接 iPhone，完成设备信任，在手机 **设置 → 隐私与安全性 → 开发者模式** 中启用开发者模式，并按手机提示重启。
5. 选择这台 iPhone 作为运行目标，点击 Run。首次运行允许相机权限。

扫描需要 LiDAR 真机；模拟器只能检查非扫描页面。签名、开发者模式和真机测试需要用户自己的设备与账号。本仓库不包含开发者证书、签名私钥或可直接安装的 IPA。

命令行构建（安装完整 Xcode 后）：

```sh
xcodebuild -project ios/RoomScanner.xcodeproj -scheme RoomScanner \
  -destination 'generic/platform=iOS' -derivedDataPath /tmp/RoomScannerDerived \
  CODE_SIGNING_ALLOWED=NO build
```

## 扫描到网页

1. 输入扫描名称，点“开始扫描”。第一版一次扫描一个房间。
2. 打开照明、缓慢移动，依次覆盖地面、墙角、天花板、门窗和主要家具。玻璃、镜子、遮挡和黑色表面可能造成遗漏或错误。
3. 点“完成扫描”，检查系统生成的 3D 预览，再点“保存模型与测量数据”。
4. 在“我的扫描”打开该记录，点“导出到户型网页”，通过系统分享存储到“文件”或隔空投送到电脑。
5. 打开户型网页，选“文件 → 导入户型 / 方案”，导入 **floorplan-scan.json**。网页会新增一个独立户型，并保留原有户型。
6. 复核房间尺寸、门向、墙厚、玻璃和关键定位。网页可以继续移动、旋转和调整家具尺寸。

USDZ 用于系统 Quick Look 或其他三维软件。`roomplan.json` 用于保留 Apple 原始结构；当前网页直接导入的是 `floorplan-scan.json`，不是原始 RoomPlan JSON 或 USDZ。

可以用 `ios/Fixtures/demo-scan.json` 验证网页导入。它是合成的 4 × 3 米演示房间，有一扇窗、一扇门和一张沙发，不是真机扫描结果。

## 数据约定与边界

`floorplan-scan` v1 使用米、右手世界坐标：X / Z 为地面，Y 向上。`RoomPlanBridge.swift` 先把地面局部 polygonCorners 乘以 surface.transform 转成世界坐标；网页再把 X/Z 投影到 X/Y、米转换成毫米。

- 墙、窗、门、通行开口分开保存；保留原始标识和 parentID，导入时匹配父墙并裁出实际开口。
- 地面多边形保持凹形轮廓。没有可用地面、门窗无法匹配墙体或存在重叠时，网页拒绝导入并保留当前方案。
- RoomPlan 不测量被遮挡的真实墙厚；缺失厚度时暂用 100 mm，导入说明会标注。
- 铰链侧、门的开启方向与家具精细造型不能由此保证。网页暂推定门向，并用扫描尺寸缩放通用家具模型；不认识的类别用占位物体表示。
- 同层高的单个房间是第一版的适用范围。斜顶、弧面、非均匀墙高和多楼层需要后续扩展。
- USDZ 使用 `.mesh` 输出以保留门窗洞口。结构化 JSON 同时保留，供后续参数编辑使用。

## 验证

没有完整 Xcode 时仍可验证 Swift 语法、独立文件存储逻辑与网页转换：

```sh
swiftc -frontend -parse ios/RoomScanner/*.swift
plutil -lint ios/RoomScanner.xcodeproj/project.pbxproj ios/RoomScanner/Info.plist ios/RoomScanner/PrivacyInfo.xcprivacy
swiftc -module-cache-path /tmp/RoomScannerModuleCache \
  ios/RoomScanner/ScanDocument.swift ios/RoomScanner/ScanArchive.swift ios/Tests/main.swift \
  -o /tmp/RoomScannerCoreTests
/tmp/RoomScannerCoreTests ios/Fixtures/demo-scan.json
node --test tests/*.test.cjs
```

语法和数据测试不等于 iOS SDK 编译或真机扫描验证。当前开发机器缺少完整 Xcode，UIKit / RoomPlan 编译、签名安装与 iPhone 17 Pro 扫描效果需要在安装 Xcode 后验证。

## Apple 参考资料

- [RoomPlan](https://developer.apple.com/documentation/roomplan)
- [扫描结果与预览回调](https://developer.apple.com/documentation/roomplan/roomcaptureviewdelegate)
- [地面和墙面多边形坐标](https://developer.apple.com/documentation/roomplan/capturedroom/surface/polygoncorners)
- [USD 导出选项](https://developer.apple.com/documentation/roomplan/capturedroom/usdexportoptions)
