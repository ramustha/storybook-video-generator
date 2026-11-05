import Foundation
import AppKit
import Vision

let storyDir = "stories/pisang-terlalu-banyak"
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

    var count = 0
    for obs in results {
        let b = obs.boundingBox
        
        // Pad slightly to remove font antialiasing fringe
        let padX: CGFloat = 12
        let padY: CGFloat = 10

        let pixelX = max(0, b.origin.x * w - padX)
        let pixelY = max(0, b.origin.y * h - padY)
        let pixelW = min(w - pixelX, b.size.width * w + padX * 2)
        let pixelH = min(h - pixelY, b.size.height * h + padY * 2)

        // Convert Vision Y (bottom-left) to rep Y (top-left)
        let boxTopInRep = (1.0 - (b.origin.y + b.size.height)) * h
        let boxBottomInRep = (1.0 - b.origin.y) * h
        
        let sampleYInRep = boxTopInRep > 14 ? Int(boxTopInRep - 8) : min(Int(h - 1), Int(boxBottomInRep + 8))
        let sampleXInRep = Int(pixelX + pixelW / 2)
        
        let color = rep.colorAt(x: sampleXInRep, y: sampleYInRep) ?? NSColor(calibratedRed: 0.96, green: 0.94, blue: 0.88, alpha: 1.0)

        color.setFill()
        NSRect(x: pixelX, y: pixelY, width: pixelW, height: pixelH).fill()
        count += 1
    }

    NSGraphicsContext.restoreGraphicsState()
    return count
}

func createBlankRep(w: Int, h: Int) -> NSBitmapImageRep {
    return NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: w,
        pixelsHigh: h,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    )!
}

// 1. Process Cover
print("🎨 Processing Cover from page_01.png...")
let coverUrl = URL(fileURLWithPath: "\(pagesDir)/page_01.png")
if let coverData = try? Data(contentsOf: coverUrl),
   let coverRep = NSBitmapImageRep(data: coverData) {
    let targetCoverW = 1836
    let targetCoverH = 1512
    let coverOutRep = createBlankRep(w: targetCoverW, h: targetCoverH)
    
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
    print("✔ [cover] Clean cover generated (\(targetCoverW)x\(targetCoverH), \(inpainted) text elements inpainted)")
}

// 2. Process Scenes 01 to 12
let sceneMapping: [(sceneId: String, pageFile: String, desc: String)] = [
    ("scene_01", "page_02.png", "Panen pisang berlimpah di kebun"),
    ("scene_02", "page_03.png", "Keluarga kenyang pisang tiap hari"),
    ("scene_03", "page_05.png", "Tetangga menolak pisang"),
    ("scene_04", "page_04.png", "Pedagang dan sapi melengos menolak"),
    ("scene_05", "page_06.png", "Sedih bingung di bawah pohon pisang"),
    ("scene_06", "page_08.png", "Pergi ke Pusat Pertanian Doddooru"),
    ("scene_07", "page_09.png", "Pulang tersenyum lebar bersiul gembira"),
    ("scene_08", "page_13.png", "Warga desa penasaran"),
    ("scene_09", "page_16.png", "Pak Shivanna panik butuh 108 pisang"),
    ("scene_10", "page_20.png", "Pak Srinivas datang membawa tas besar"),
    ("scene_11", "page_25.png", "Dodol pisang dibuka, warga tertawa dan tepuk tangan"),
    ("scene_12", "page_26.png", "Pak Srinivas tersenyum bersama anak-anak (Hero vignette)"),
]

let targetW: CGFloat = 1920
let targetH: CGFloat = 1080

for item in sceneMapping {
    let pUrl = URL(fileURLWithPath: "\(pagesDir)/\(item.pageFile)")
    guard let data = try? Data(contentsOf: pUrl),
          let rep = NSBitmapImageRep(data: data) else {
        print("⚠️ Warning: Could not load \(item.pageFile)")
        continue
    }

    let outRep = createBlankRep(w: Int(targetW), h: Int(targetH))
    NSGraphicsContext.saveGraphicsState()
    let ctx = NSGraphicsContext(bitmapImageRep: outRep)!
    NSGraphicsContext.current = ctx

    // Aspect-fit centered into 1920x1080 canvas
    let srcW = CGFloat(rep.pixelsWide)
    let srcH = CGFloat(rep.pixelsHigh)
    let scale = min(targetW / srcW, targetH / srcH)
    let drawW = srcW * scale
    let drawH = srcH * scale
    let drawX = (targetW - drawW) / 2
    let drawY = (targetH - drawH) / 2

    // Background fill with sampled border color
    let sampleBg = rep.colorAt(x: 10, y: 10) ?? NSColor(calibratedRed: 0.96, green: 0.94, blue: 0.90, alpha: 1.0)
    sampleBg.setFill()
    NSRect(x: 0, y: 0, width: targetW, height: targetH).fill()

    rep.draw(
        in: NSRect(x: drawX, y: drawY, width: drawW, height: drawH),
        from: NSRect(x: 0, y: 0, width: srcW, height: srcH),
        operation: .sourceOver,
        fraction: 1.0,
        respectFlipped: false,
        hints: [.interpolation: NSImageInterpolation.high]
    )
    NSGraphicsContext.restoreGraphicsState()

    let inpainted = inpaintPlate(rep: outRep)
    let pngData = outRep.representation(using: .png, properties: [:])!
    let outPath = "\(assetsDir)/\(item.sceneId).png"
    try? pngData.write(to: URL(fileURLWithPath: outPath))
    print("✔ [\(item.sceneId)] \(item.desc) (\(item.pageFile) -> \(inpainted) text elements inpainted)")
}

print("\n🎉 ALL 12 SCENE PLATES GENERATED SUCCESSFULLY IN \(assetsDir)!")
