import Foundation
import AppKit
import Vision

let storyDir = "stories/hari-cukur-rambut"
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
        let recognizedText = obs.topCandidates(1).first?.string ?? ""
        
        // Skip comic signs if needed, but inpaint narrative text and page numbers
        // In this book: all narrative sentences and page numbers (12, 13, 14, etc.) should be inpainted
        let padX: CGFloat = 10
        let padY: CGFloat = 8

        let pixelX = max(0, b.origin.x * w - padX)
        let pixelY = max(0, b.origin.y * h - padY)
        let pixelW = min(w - pixelX, b.size.width * w + padX * 2)
        let pixelH = min(h - pixelY, b.size.height * h + padY * 2)

        // Sample neighboring background color from rep (top-left origin)
        // Convert Vision Y (bottom-left) to rep Y (top-left)
        let boxTopInRep = (1.0 - (b.origin.y + b.size.height)) * h
        let boxBottomInRep = (1.0 - b.origin.y) * h
        
        // Prefer sampling from above the box; if at top of image, sample from below
        let sampleYInRep = boxTopInRep > 12 ? Int(boxTopInRep - 6) : min(Int(h - 1), Int(boxBottomInRep + 6))
        let sampleXInRep = Int(pixelX + pixelW / 2)
        
        let color = rep.colorAt(x: sampleXInRep, y: sampleYInRep) ?? NSColor(calibratedRed: 0.95, green: 0.93, blue: 0.88, alpha: 1.0)

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

// ==========================================
// 1. Process Cover (Landscape Book Cover)
// ==========================================
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

// ==========================================
// 2. Process Scenes 01 to 11 (1920x1080 16:9 Plates)
// ==========================================
let sceneMapping: [(sceneId: String, pageFile: String, desc: String)] = [
    ("scene_01", "page_05.png", "Sringeri berangkat ke tukang cukur desa"),
    ("scene_02", "page_06.png", "Tukang cukur menolak (House Full)"),
    ("scene_03", "page_08.png", "Istri menolak di dapur"),
    ("scene_04", "page_10.png", "Penjahit menolak"),
    ("scene_05", "page_12.png", "Tukang kayu menolak"),
    ("scene_06", "page_14.png", "Berjalan ke hutan menangis"),
    ("scene_07", "page_16.png", "Menangis keras dekat gua"),
    ("scene_08", "page_18.png", "Harimau keluar mengaum mengayunkan cakar"),
    ("scene_09", "page_20.png", "Kaget sampai seluruh rambut rontok (Plop!)"),
    ("scene_10", "page_21.png", "Lari pulang bahagia kepala botak licin"),
    ("scene_11", "page_22.png", "Tersenyum gembira tidak perlu potong rambut lagi"),
]

let targetW: CGFloat = 1920
let targetH: CGFloat = 1080

for item in sceneMapping {
    let pageUrl = URL(fileURLWithPath: "\(pagesDir)/\(item.pageFile)")
    guard let pageData = try? Data(contentsOf: pageUrl),
          let pageRep = NSBitmapImageRep(data: pageData) else {
        print("❌ Could not load \(pageUrl.path)")
        continue
    }

    let outRep = createBlankRep(w: Int(targetW), h: Int(targetH))

    NSGraphicsContext.saveGraphicsState()
    let ctx = NSGraphicsContext(bitmapImageRep: outRep)!
    NSGraphicsContext.current = ctx

    // 1. Draw subtle ambient background extension to fill full 1920x1080
    // Scale slightly to cover canvas
    let bgScale = max(targetW / CGFloat(pageRep.pixelsWide), targetH / CGFloat(pageRep.pixelsHigh))
    let bgW = CGFloat(pageRep.pixelsWide) * bgScale
    let bgH = CGFloat(pageRep.pixelsHigh) * bgScale
    let bgX = (targetW - bgW) / 2.0
    let bgY = (targetH - bgH) / 2.0

    pageRep.draw(
        in: NSRect(x: bgX, y: bgY, width: bgW, height: bgH),
        from: NSRect(x: 0, y: 0, width: pageRep.pixelsWide, height: pageRep.pixelsHigh),
        operation: .copy,
        fraction: 1.0,
        respectFlipped: false,
        hints: [.interpolation: NSImageInterpolation.high]
    )

    // 2. Overlay authentic crisp center artwork (height=1080, width~1311)
    let centerH = targetH
    let centerW = centerH * (CGFloat(pageRep.pixelsWide) / CGFloat(pageRep.pixelsHigh))
    let centerX = (targetW - centerW) / 2.0

    pageRep.draw(
        in: NSRect(x: centerX, y: 0, width: centerW, height: centerH),
        from: NSRect(x: 0, y: 0, width: pageRep.pixelsWide, height: pageRep.pixelsHigh),
        operation: .sourceOver,
        fraction: 1.0,
        respectFlipped: false,
        hints: [.interpolation: NSImageInterpolation.high]
    )

    NSGraphicsContext.restoreGraphicsState()

    // 3. Inpaint text on the resulting 1920x1080 plate
    let inpainted = inpaintPlate(rep: outRep)

    let outUrl = URL(fileURLWithPath: "\(assetsDir)/\(item.sceneId).png")
    let pngData = outRep.representation(using: .png, properties: [:])!
    try? pngData.write(to: outUrl)
    print("✔ [\(item.sceneId)] 16:9 plate created: \(Int(targetW))x\(Int(targetH)) (\(inpainted) text elements inpainted) -> \(item.desc)")
}

// ==========================================
// 3. Process Protagonist Avatar (for Moral Scene)
// ==========================================
print("🎨 Extracting Protagonist Avatar from page_22.png...")
let p22Url = URL(fileURLWithPath: "\(pagesDir)/page_22.png")
if let p22Data = try? Data(contentsOf: p22Url),
   let p22Rep = NSBitmapImageRep(data: p22Data) {
    let avatarSize = 600
    let avatarRep = createBlankRep(w: avatarSize, h: avatarSize)
    
    // In page_22, Sringeri Srinivas is in the center
    let origW = CGFloat(p22Rep.pixelsWide)
    let origH = CGFloat(p22Rep.pixelsHigh)
    let cropSize = min(origW, origH) * 0.75
    let cropX = (origW - cropSize) / 2.0
    let cropY = (origH - cropSize) / 2.0
    
    NSGraphicsContext.saveGraphicsState()
    let aCtx = NSGraphicsContext(bitmapImageRep: avatarRep)!
    NSGraphicsContext.current = aCtx
    p22Rep.draw(
        in: NSRect(x: 0, y: 0, width: avatarSize, height: avatarSize),
        from: NSRect(x: cropX, y: cropY, width: cropSize, height: cropSize),
        operation: .copy,
        fraction: 1.0,
        respectFlipped: false,
        hints: [.interpolation: NSImageInterpolation.high]
    )
    NSGraphicsContext.restoreGraphicsState()
    _ = inpaintPlate(rep: avatarRep)
    
    let aData = avatarRep.representation(using: .png, properties: [:])!
    try? aData.write(to: URL(fileURLWithPath: "\(assetsDir)/protagonist_avatar.png"))
    print("✔ [avatar] Protagonist avatar created (600x600) -> protagonist_avatar.png")
}

print("\n🎉 All authentic illustration plates for Hari Cukur Rambut Sringeri Srinivas successfully created in \(assetsDir)!")
