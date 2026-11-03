import Foundation
import AppKit
import Vision

let storyDir = "stories/raja-gemuk-anjing-kurus"
let pagesDir = "\(storyDir)/raw/pages"
let assetsDir = "\(storyDir)/assets"

try? FileManager.default.createDirectory(atPath: assetsDir, withIntermediateDirectories: true)

// Inpainting function using Vision OCR
func inpaintPlate(rep: NSBitmapImageRep) -> Int {
    guard let cgImage = rep.cgImage else { return 0 }
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    try? handler.perform([req])

    let results = req.results ?? []
    if results.isEmpty { return 0 }

    let w = CGFloat(rep.pixelsWide)
    let h = CGFloat(rep.pixelsHigh)

    NSGraphicsContext.saveGraphicsState()
    guard let ctx = NSGraphicsContext(bitmapImageRep: rep) else {
        NSGraphicsContext.restoreGraphicsState()
        return 0
    }
    NSGraphicsContext.current = ctx

    for obs in results {
        let b = obs.boundingBox
        let padX: CGFloat = 8
        let padY: CGFloat = 6

        let pixelX = max(0, b.origin.x * w - padX)
        let pixelY = max(0, b.origin.y * h - padY)
        let pixelW = min(w - pixelX, b.size.width * w + padX * 2)
        let pixelH = min(h - pixelY, b.size.height * h + padY * 2)

        // Sample neighboring background color
        let sampleY = pixelY + pixelH + 4 < h ? Int(pixelY + pixelH + 4) : max(0, Int(pixelY - 4))
        let sampleX = Int(pixelX + pixelW / 2)
        let color = rep.colorAt(x: sampleX, y: sampleY) ?? NSColor(calibratedRed: 0.97, green: 0.89, blue: 0.67, alpha: 1.0)

        color.setFill()
        NSRect(x: pixelX, y: pixelY, width: pixelW, height: pixelH).fill()
    }

    NSGraphicsContext.restoreGraphicsState()
    return results.count
}

// 1. Process Cover (Portrait)
print("🎨 Processing Cover from page_01.png...")
let coverUrl = URL(fileURLWithPath: "\(pagesDir)/page_01.png")
if let coverData = try? Data(contentsOf: coverUrl),
   let coverRep = NSBitmapImageRep(data: coverData) {
    let targetCoverW: CGFloat = 2000
    let targetCoverH = targetCoverW * (CGFloat(coverRep.pixelsHigh) / CGFloat(coverRep.pixelsWide))
    
    let coverOutRep = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: Int(targetCoverW),
        pixelsHigh: Int(targetCoverH),
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    )!
    
    NSGraphicsContext.saveGraphicsState()
    let cCtx = NSGraphicsContext(bitmapImageRep: coverOutRep)!
    NSGraphicsContext.current = cCtx
    coverRep.draw(
        in: NSRect(x: 0, y: 0, width: targetCoverW, height: targetCoverH),
        from: NSRect(x: 0, y: 0, width: coverRep.pixelsWide, height: coverRep.pixelsHigh),
        operation: .copy,
        fraction: 1.0,
        respectFlipped: false,
        hints: [.interpolation: NSImageInterpolation.high]
    )
    NSGraphicsContext.restoreGraphicsState()
    
    let inpainted = inpaintPlate(rep: coverOutRep)
    let pngData = coverOutRep.representation(using: .png, properties: [:])!
    try? pngData.write(to: URL(fileURLWithPath: "\(assetsDir)/cover.png"))
    print("✔ [cover] Authentic portrait cover generated (\(Int(targetCoverW))x\(Int(targetCoverH)), \(inpainted) text elements inpainted)")
}

// 2. Process Scenes 01 to 09
let sceneMapping: [(sceneId: String, pageFile: String, panOffset: CGFloat)] = [
    ("scene_01", "page_02.png", 0.0),   // Fat king on throne/standing
    ("scene_02", "page_03.png", -0.05), // Fat king with dog (focus slightly left)
    ("scene_03", "page_03.png", 0.05),  // Fat king and dog walking (focus slightly right)
    ("scene_04", "page_04.png", -0.05), // Dog sees bird
    ("scene_05", "page_04.png", 0.05),  // Dog runs after bird
    ("scene_06", "page_05.png", 0.0),   // King runs after dog
    ("scene_07", "page_06.png", 0.0),   // Run and run for many days
    ("scene_08", "page_07.png", 0.0),   // King catches dog
    ("scene_09", "page_08.png", 0.0),   // Thin king and dog
]

let targetW: CGFloat = 1920
let targetH: CGFloat = 1080
let bgWarmCream = NSColor(calibratedRed: 0.97, green: 0.89, blue: 0.67, alpha: 1.0)

for item in sceneMapping {
    let pageUrl = URL(fileURLWithPath: "\(pagesDir)/\(item.pageFile)")
    guard let pageData = try? Data(contentsOf: pageUrl),
          let pageRep = NSBitmapImageRep(data: pageData) else {
        print("❌ Could not load \(pageUrl.path)")
        continue
    }

    // Authentic illustration frame on page: x=105..1755, y=25..1855 (h=1830)
    // Note in Cocoa: y=0 is bottom!
    // Page height is 2526. The illustration is yTop=25..1855, which corresponds to:
    // Cocoa y = 2526 - 1855 = 671 up to 2526 - 25 = 2501.
    let cropX: CGFloat = 105
    let cropY: CGFloat = 2526 - 1855 // 671
    let cropW: CGFloat = 1650
    let cropH: CGFloat = 1830

    let outRep = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: Int(targetW),
        pixelsHigh: Int(targetH),
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    )!

    NSGraphicsContext.saveGraphicsState()
    let ctx = NSGraphicsContext(bitmapImageRep: outRep)!
    NSGraphicsContext.current = ctx

    // Fill full 16:9 canvas with seamless background
    bgWarmCream.setFill()
    NSRect(x: 0, y: 0, width: targetW, height: targetH).fill()

    // Scale illustration to fit height exactly (1080)
    let scale = targetH / cropH
    let drawW = cropW * scale
    let drawH = targetH
    let centerX = (targetW - drawW) / 2.0 + (item.panOffset * targetW)

    pageRep.draw(
        in: NSRect(x: centerX, y: 0, width: drawW, height: drawH),
        from: NSRect(x: cropX, y: cropY, width: cropW, height: cropH),
        operation: .sourceOver,
        fraction: 1.0,
        respectFlipped: false,
        hints: [.interpolation: NSImageInterpolation.high]
    )

    NSGraphicsContext.restoreGraphicsState()

    // Inpaint any residual text or edge artifacts
    let inpainted = inpaintPlate(rep: outRep)

    let outUrl = URL(fileURLWithPath: "\(assetsDir)/\(item.sceneId).png")
    let pngData = outRep.representation(using: .png, properties: [:])!
    try? pngData.write(to: outUrl)
    print("✔ [\(item.sceneId)] Authentic 16:9 plate created: \(Int(targetW))x\(Int(targetH)) (\(inpainted) text elements inpainted) -> \(outUrl.lastPathComponent)")
}

print("\n🎉 All 10 authentic illustration plates generated successfully in \(assetsDir)!")
