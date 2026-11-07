import Foundation
import AppKit
import Vision

let storyDir = "stories/terlalu-banyak-suara"
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
        
        // Inpaint all narrative text blocks and page numbers
        let padX: CGFloat = 12
        let padY: CGFloat = 8

        let pixelX = max(0, b.origin.x * w - padX)
        let pixelY = max(0, b.origin.y * h - padY)
        let pixelW = min(w - pixelX, b.size.width * w + padX * 2)
        let pixelH = min(h - pixelY, b.size.height * h + padY * 2)

        // Convert Vision Y (bottom-left) to rep Y (top-left)
        let boxTopInRep = (1.0 - (b.origin.y + b.size.height)) * h
        let boxBottomInRep = (1.0 - b.origin.y) * h
        
        let sampleYInRep = boxTopInRep > 14 ? Int(boxTopInRep - 8) : min(Int(h - 1), Int(boxBottomInRep + 8))
        let sampleXInRep = Int(pixelX + pixelW / 2)
        
        let color = rep.colorAt(x: sampleXInRep, y: sampleYInRep) ?? NSColor(calibratedRed: 0.96, green: 0.94, blue: 0.89, alpha: 1.0)

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

// 1. Process Cover (page_01.png)
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
    print("✔ [cover] Clean cover generated (\(targetCoverW)x\(targetCoverH), \(inpainted) text blocks inpainted)")
}

// 2. Process Scenes 01 to 11
let sceneMapping: [(sceneId: String, pageFile: String, desc: String)] = [
    ("scene_01", "page_02.png", "Srinivas dan sapi-sapi berjalan ke pekan ternak"),
    ("scene_02", "page_03.png", "Jalan raya baru bising penuh klakson truk Paoon!"),
    ("scene_03", "page_04.png", "Srinivas melambai minta diam, klakson malah makin kencang"),
    ("scene_04", "page_05.png", "Suara klakson terperangkap dalam kepala Srinivas"),
    ("scene_05", "page_06.png", "Suara katak, jangkrik, burung hantu memekakkan telinga"),
    ("scene_06", "page_08.png", "Srinivas marah pada anak-anak dan panci presto Parvatamma"),
    ("scene_07", "page_09.png", "Warga desa berusaha hening, anak bermain bola lembut"),
    ("scene_08", "page_12.png", "Srinivas pamit meninggalkan desa mencari ketenangan"),
    ("scene_09", "page_13.png", "Melihat pemuda kota bahagia memakai headphone di keramaian"),
    ("scene_10", "page_15.png", "Srinivas membeli headphone terbaik dan tersenyum lega"),
    ("scene_11", "page_18.png", "Damai memakai headphone, sapi-sapi melenguh gembira"),
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

    // Ambient background fill
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

    // Crisp center artwork overlay
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

    // Inpaint text on resulting 16:9 plate
    let inpainted = inpaintPlate(rep: outRep)

    let outUrl = URL(fileURLWithPath: "\(assetsDir)/\(item.sceneId).png")
    let pngData = outRep.representation(using: .png, properties: [:])!
    try? pngData.write(to: outUrl)
    print("✔ [\(item.sceneId)] 16:9 plate created: \(Int(targetW))x\(Int(targetH)) (\(inpainted) text elements inpainted) -> \(item.desc)")
}

// 3. Extract Protagonist Avatar for Moral Outro
print("🎨 Extracting Protagonist Avatar from page_15.png...")
let p15Url = URL(fileURLWithPath: "\(pagesDir)/page_15.png")
if let p15Data = try? Data(contentsOf: p15Url),
   let p15Rep = NSBitmapImageRep(data: p15Data) {
    let avatarSize = 600
    let avatarRep = createBlankRep(w: avatarSize, h: avatarSize)
    
    let origW = CGFloat(p15Rep.pixelsWide)
    let origH = CGFloat(p15Rep.pixelsHigh)
    let cropSize = min(origW, origH) * 0.70
    let cropX = (origW - cropSize) / 2.0
    let cropY = (origH - cropSize) / 2.0
    
    NSGraphicsContext.saveGraphicsState()
    let aCtx = NSGraphicsContext(bitmapImageRep: avatarRep)!
    NSGraphicsContext.current = aCtx
    p15Rep.draw(
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

print("\n🎉 All authentic illustration plates for Terlalu Banyak Suara! successfully created in \(assetsDir)!")
