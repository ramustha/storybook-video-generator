import Foundation
import AppKit
import PDFKit
import Vision

// ==============================================================================
// 🎨 UNIVERSAL STORYBOOK PLATE PREPARATION ENGINE
// ==============================================================================
// Ingests open-license storybook PDFs / pages, performs Vision OCR text localization,
// texture-sampling inpainting, 16:9 widescreen composition, and avatar extraction.
// Data-driven by stories/<slug>/story.json.
// ==============================================================================

func printHelp() {
    print("""
    Usage:
      swift scripts/prepare-plates.swift --book <slug>
      npm run plates -- --book <slug>

    Options:
      --book <slug>     Target storybook slug in stories/<slug>
      --scale <float>    PDF render scale (default: 2.5 for high-res plates)
      --skip-inpaint    Skip text inpainting (extract/crop plates only)
      --force-pdf       Re-extract pages from raw/source-book.pdf even if raw/pages/ exists
    """)
}

// ------------------------------------------------------------------------------
// CLI Arguments Parsing
// ------------------------------------------------------------------------------
var targetSlug: String? = nil
var pdfScale: Double = 2.5
var skipInpaint: Bool = false
var forcePdf: Bool = false

var args = CommandLine.arguments.dropFirst()
while let arg = args.first {
    args = args.dropFirst()
    if arg == "--book" || arg == "-b" {
        targetSlug = args.first
        args = args.dropFirst()
    } else if arg == "--scale" {
        if let s = args.first, let d = Double(s) { pdfScale = d }
        args = args.dropFirst()
    } else if arg == "--skip-inpaint" {
        skipInpaint = true
    } else if arg == "--force-pdf" {
        forcePdf = true
    } else if arg == "--help" || arg == "-h" {
        printHelp()
        exit(0)
    } else if targetSlug == nil && !arg.hasPrefix("-") {
        targetSlug = arg.replacingOccurrences(of: "^stories/", with: "", options: .regularExpression)
    }
}

guard let slug = targetSlug else {
    print("❌ Error: Missing required --book <slug> argument.\n")
    printHelp()
    exit(1)
}

let storyDir = "stories/\(slug)"
let rawDir = "\(storyDir)/raw"
let pagesDir = "\(rawDir)/pages"
let assetsDir = "\(storyDir)/assets"
let manifestPath = "\(storyDir)/story.json"
let pdfPath = "\(rawDir)/source-book.pdf"

print("\n=======================================================")
print("🎨 UNIVERSAL PLATE PREPARATION ENGINE")
print("=======================================================")
print("📖 Book Slug : \(slug)")
print("📁 Story Dir : \(storyDir)")
print("=======================================================\n")

guard FileManager.default.fileExists(atPath: manifestPath) else {
    print("❌ Error: Manifest not found at \(manifestPath)")
    exit(1)
}

// ------------------------------------------------------------------------------
// Read & Parse story.json
// ------------------------------------------------------------------------------
guard let manifestData = try? Data(contentsOf: URL(fileURLWithPath: manifestPath)),
      let manifest = try? JSONSerialization.jsonObject(with: manifestData) as? [String: Any] else {
    print("❌ Error: Could not parse \(manifestPath) as JSON")
    exit(1)
}

let title = (manifest["title"] as? String) ?? slug
print("📚 Story Title: \"\(title)\"")

try? FileManager.default.createDirectory(atPath: assetsDir, withIntermediateDirectories: true)
try? FileManager.default.createDirectory(atPath: pagesDir, withIntermediateDirectories: true)

// ------------------------------------------------------------------------------
// Step 1: Auto-Extract PDF Pages if needed
// ------------------------------------------------------------------------------
let existingPages = (try? FileManager.default.contentsOfDirectory(atPath: pagesDir).filter { $0.hasSuffix(".png") }) ?? []
if existingPages.isEmpty || forcePdf {
    if FileManager.default.fileExists(atPath: pdfPath) {
        print("\n📄 Extracting high-res pages from \(pdfPath) (scale: \(pdfScale))...")
        guard let pdfDoc = PDFDocument(url: URL(fileURLWithPath: pdfPath)) else {
            print("❌ Failed to open PDF at \(pdfPath)")
            exit(1)
        }
        let total = pdfDoc.pageCount
        for i in 0..<total {
            guard let page = pdfDoc.page(at: i) else { continue }
            let bounds = page.bounds(for: .mediaBox)
            let size = CGSize(width: bounds.width * pdfScale, height: bounds.height * pdfScale)
            let image = page.thumbnail(of: size, for: .mediaBox)
            if let tiff = image.tiffRepresentation,
               let bitmap = NSBitmapImageRep(data: tiff),
               let png = bitmap.representation(using: .png, properties: [:]) {
                let out = URL(fileURLWithPath: pagesDir).appendingPathComponent(String(format: "page_%02d.png", i + 1))
                try? png.write(to: out)
            }
        }
        print("✔ Extracted \(total) pages into \(pagesDir)")
    } else {
        print("⚠️ Warning: No raw/source-book.pdf found and raw/pages/ is empty.")
    }
} else {
    print("✔ Found \(existingPages.count) existing pages in \(pagesDir)")
}

// ------------------------------------------------------------------------------
// Step 2: Inpainting Helper Function (Apple Vision OCR)
// ------------------------------------------------------------------------------
func inpaintPlate(rep: NSBitmapImageRep) -> Int {
    guard !skipInpaint else { return 0 }
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

        let padX: CGFloat = 12
        let padY: CGFloat = 8

        let pixelX = max(0, b.origin.x * w - padX)
        let pixelY = max(0, b.origin.y * h - padY)
        let pixelW = min(w - pixelX, b.size.width * w + padX * 2)
        let pixelH = min(h - pixelY, b.size.height * h + padY * 2)

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

func resolvePageFile(source: Any?, defaultIndex: Int) -> String {
    if let str = source as? String {
        return str.hasSuffix(".png") ? str : "\(str).png"
    } else if let num = source as? Int {
        return String(format: "page_%02d.png", num)
    }
    return String(format: "page_%02d.png", defaultIndex)
}

// ------------------------------------------------------------------------------
// Step 3: Process Cover Plate
// ------------------------------------------------------------------------------
print("\n🎨 [1/3] Processing Cover Plate...")
let coverPageSource = manifest["coverPage"] ?? 1
let coverFileName = resolvePageFile(source: coverPageSource, defaultIndex: 1)
let coverPath = "\(pagesDir)/\(coverFileName)"

if FileManager.default.fileExists(atPath: coverPath),
   let coverData = try? Data(contentsOf: URL(fileURLWithPath: coverPath)),
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

    // Preserve authentic original cover without text inpainting
    let pngData = coverOutRep.representation(using: .png, properties: [:])!
    try? pngData.write(to: URL(fileURLWithPath: "\(assetsDir)/cover.png"))
    print("✔ [cover] Authentic original cover preserved: \(targetCoverW)x\(targetCoverH) from \(coverFileName)")
} else {
    print("⚠️ Warning: Cover source page not found at \(coverPath)")
}

// ------------------------------------------------------------------------------
// Step 4: Process Scene Plates (1920x1080 Widescreen)
// ------------------------------------------------------------------------------
print("\n🎬 [2/3] Processing 16:9 Scene Plates...")
let scenes = (manifest["scenes"] as? [[String: Any]]) ?? []
let targetW: CGFloat = 1920
let targetH: CGFloat = 1080

var processedScenes = 0
for (idx, scene) in scenes.enumerated() {
    let sceneId = (scene["sceneId"] as? String) ?? String(format: "scene_%02d", idx)
    let sceneType = (scene["type"] as? String) ?? "story"

    // Skip outro / recommendation frames that reuse cover
    if sceneType == "outro" || sceneId == "cover" {
        continue
    }

    // Resolve source page: custom sourcePage field > visual.imagePath hint > sequential index + 1
    var pageSource: Any? = scene["sourcePage"]
    if pageSource == nil, let visual = scene["visual"] as? [String: Any], let p = visual["sourcePage"] {
        pageSource = p
    }

    // Default sequential mapping if not specified: cover is 1, scene 1 is 2, etc.
    let pageFileName = resolvePageFile(source: pageSource, defaultIndex: idx + 1)
    let pageUrl = URL(fileURLWithPath: "\(pagesDir)/\(pageFileName)")

    guard let pageData = try? Data(contentsOf: pageUrl),
          let pageRep = NSBitmapImageRep(data: pageData) else {
        print("⚠️ [\(sceneId)] Source page not found: \(pageFileName), skipping.")
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

    // Inpaint narrative text & page numbers
    let inpainted = inpaintPlate(rep: outRep)

    let outPath = "\(assetsDir)/\(sceneId).png"
    let pngData = outRep.representation(using: .png, properties: [:])!
    try? pngData.write(to: URL(fileURLWithPath: outPath))

    print("✔ [\(sceneId)] 16:9 plate: 1920x1080 (\(inpainted) text elements inpainted) from \(pageFileName)")
    processedScenes += 1
}

// ------------------------------------------------------------------------------
// Step 5: Process Protagonist Avatar (for Moral Scene)
// ------------------------------------------------------------------------------
print("\n🧑 [3/3] Extracting Protagonist Avatar...")
let avatarSource = manifest["avatarPage"] ?? 15
let avatarFileName = resolvePageFile(source: avatarSource, defaultIndex: 15)
let avatarPath = "\(pagesDir)/\(avatarFileName)"

if FileManager.default.fileExists(atPath: avatarPath),
   let aData = try? Data(contentsOf: URL(fileURLWithPath: avatarPath)),
   let aRep = NSBitmapImageRep(data: aData) {
    let avatarSize = 600
    let avatarRep = createBlankRep(w: avatarSize, h: avatarSize)

    let origW = CGFloat(aRep.pixelsWide)
    let origH = CGFloat(aRep.pixelsHigh)
    let cropSize = min(origW, origH) * 0.70
    let cropX = (origW - cropSize) / 2.0
    let cropY = (origH - cropSize) / 2.0

    NSGraphicsContext.saveGraphicsState()
    let aCtx = NSGraphicsContext(bitmapImageRep: avatarRep)!
    NSGraphicsContext.current = aCtx
    aRep.draw(
        in: NSRect(x: 0, y: 0, width: avatarSize, height: avatarSize),
        from: NSRect(x: cropX, y: cropY, width: cropSize, height: cropSize),
        operation: .copy,
        fraction: 1.0,
        respectFlipped: false,
        hints: [.interpolation: NSImageInterpolation.high]
    )
    NSGraphicsContext.restoreGraphicsState()
    _ = inpaintPlate(rep: avatarRep)

    let png = avatarRep.representation(using: .png, properties: [:])!
    try? png.write(to: URL(fileURLWithPath: "\(assetsDir)/protagonist_avatar.png"))
    print("✔ [avatar] Protagonist avatar extracted (600x600) from \(avatarFileName) -> protagonist_avatar.png")
} else {
    // Fallback: copy from cover if specific avatar page is not found
    let fallbackPath = "\(assetsDir)/cover.png"
    if FileManager.default.fileExists(atPath: fallbackPath) {
        try? FileManager.default.copyItem(atPath: fallbackPath, toPath: "\(assetsDir)/protagonist_avatar.png")
        print("ℹ️ Copied cover as fallback protagonist avatar.")
    }
}

print("\n=======================================================")
print("🎉 UNIVERSAL PLATE PREPARATION COMPLETE!")
print("   Story: \(slug)")
print("   Assets Directory: \(assetsDir)")
print("   Total Scenes Processed: \(processedScenes)")
print("=======================================================\n")
