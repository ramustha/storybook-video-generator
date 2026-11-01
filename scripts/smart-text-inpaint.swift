import Foundation
import AppKit
import Vision

var bookSlug = "jas-hujan-merah"
for (idx, arg) in CommandLine.arguments.enumerated() {
    if arg == "--book" && idx + 1 < CommandLine.arguments.count {
        bookSlug = CommandLine.arguments[idx + 1]
    }
}

let storyDir = "stories/\(bookSlug)"
let assetsDir = "\(storyDir)/assets"
let pagesDir = "\(storyDir)/raw/pages"

try? FileManager.default.createDirectory(atPath: assetsDir, withIntermediateDirectories: true)

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
        // Vision b: origin (x, y) normalized where y=0 is bottom
        let padX: CGFloat = 8
        let padY: CGFloat = 6

        let pixelX = max(0, b.origin.x * w - padX)
        let pixelY = max(0, b.origin.y * h - padY)
        let pixelW = min(w - pixelX, b.size.width * w + padX * 2)
        let pixelH = min(h - pixelY, b.size.height * h + padY * 2)

        // Sample neighboring background color just above or below the text box
        let sampleY = pixelY + pixelH + 4 < h ? Int(pixelY + pixelH + 4) : max(0, Int(pixelY - 4))
        let sampleX = Int(pixelX + pixelW / 2)
        let color = rep.colorAt(x: sampleX, y: sampleY) ?? NSColor(calibratedRed: 0.95, green: 0.95, blue: 0.95, alpha: 1.0)

        color.setFill()
        NSRect(x: pixelX, y: pixelY, width: pixelW, height: pixelH).fill()
    }

    NSGraphicsContext.restoreGraphicsState()
    return results.count
}

func generateTextFreePlate(sceneId: String, leftPage: String, rightPage: String?) {
    let leftUrl = URL(fileURLWithPath: "\(pagesDir)/\(leftPage)")
    guard let leftData = try? Data(contentsOf: leftUrl),
          let leftRep = NSBitmapImageRep(data: leftData) else {
        return
    }

    let spreadW: CGFloat
    let spreadH: CGFloat
    let fullSpreadRep: NSBitmapImageRep

    if let rightName = rightPage {
        let rightUrl = URL(fileURLWithPath: "\(pagesDir)/\(rightName)")
        guard let rightData = try? Data(contentsOf: rightUrl),
              let rightRep = NSBitmapImageRep(data: rightData) else {
            return
        }

        spreadW = CGFloat(leftRep.pixelsWide + rightRep.pixelsWide)
        spreadH = CGFloat(max(leftRep.pixelsHigh, rightRep.pixelsHigh))

        fullSpreadRep = NSBitmapImageRep(
            bitmapDataPlanes: nil,
            pixelsWide: Int(spreadW),
            pixelsHigh: Int(spreadH),
            bitsPerSample: 8,
            samplesPerPixel: 4,
            hasAlpha: true,
            isPlanar: false,
            colorSpaceName: .deviceRGB,
            bytesPerRow: 0,
            bitsPerPixel: 0
        )!

        NSGraphicsContext.saveGraphicsState()
        let ctx = NSGraphicsContext(bitmapImageRep: fullSpreadRep)!
        NSGraphicsContext.current = ctx
        leftRep.draw(in: NSRect(x: 0, y: 0, width: CGFloat(leftRep.pixelsWide), height: spreadH))
        rightRep.draw(in: NSRect(x: CGFloat(leftRep.pixelsWide), y: 0, width: CGFloat(rightRep.pixelsWide), height: spreadH))
        NSGraphicsContext.restoreGraphicsState()
    } else {
        spreadW = CGFloat(leftRep.pixelsWide)
        spreadH = CGFloat(leftRep.pixelsHigh)
        fullSpreadRep = leftRep
    }

    if sceneId == "cover" {
        // Portrait book cover: preserve native portrait aspect ratio without slicing
        let targetCoverW: CGFloat = 2000
        let targetCoverH = targetCoverW * (spreadH / spreadW)
        
        let coverPlateRep = NSBitmapImageRep(
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
        let cCtx = NSGraphicsContext(bitmapImageRep: coverPlateRep)!
        NSGraphicsContext.current = cCtx
        fullSpreadRep.draw(
            in: NSRect(x: 0, y: 0, width: targetCoverW, height: targetCoverH),
            from: NSRect(x: 0, y: 0, width: spreadW, height: spreadH),
            operation: .copy,
            fraction: 1.0,
            respectFlipped: false,
            hints: [.interpolation: NSImageInterpolation.high]
        )
        NSGraphicsContext.restoreGraphicsState()
        
        let inpaintedCount = inpaintPlate(rep: coverPlateRep)
        
        guard let outCG = coverPlateRep.cgImage else { return }
        let verifyReq = VNRecognizeTextRequest()
        verifyReq.recognitionLevel = .accurate
        let verifyHandler = VNImageRequestHandler(cgImage: outCG, options: [:])
        try? verifyHandler.perform([verifyReq])
        let remainingTextCount = verifyReq.results?.count ?? 0
        
        let outUrl = URL(fileURLWithPath: "\(assetsDir)/\(sceneId).png")
        let pngData = coverPlateRep.representation(using: .png, properties: [:])!
        try? pngData.write(to: outUrl)
        
        print("✔ [cover] PORTRAIT BOOK COVER (\(Int(targetCoverW))x\(Int(targetCoverH)), \(inpaintedCount) text boxes inpainted, \(remainingTextCount) residual) -> \(outUrl.lastPathComponent)")
        return
    }

    let finalPlateW: CGFloat = 1920
    let finalPlateH: CGFloat = 1080

    let finalRep = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: Int(finalPlateW),
        pixelsHigh: Int(finalPlateH),
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    )!

    NSGraphicsContext.saveGraphicsState()
    let ctx = NSGraphicsContext(bitmapImageRep: finalRep)!
    NSGraphicsContext.current = ctx

    if rightPage != nil {
        // Two-page spread: crop 16:9 from bottom ~76% where illustration resides
        let targetH = spreadW * (9.0 / 16.0)
        let cropHeight = min(spreadH * 0.76, targetH)
        let cropW = cropHeight * (16.0 / 9.0)
        let cropX = (spreadW - cropW) / 2.0
        let cropY: CGFloat = 0.0 // bottom aligned (Cocoa y=0 is bottom)

        fullSpreadRep.draw(
            in: NSRect(x: 0, y: 0, width: finalPlateW, height: finalPlateH),
            from: NSRect(x: cropX, y: cropY, width: cropW, height: cropHeight),
            operation: .copy,
            fraction: 1.0,
            respectFlipped: false,
            hints: [.interpolation: NSImageInterpolation.high]
        )
    } else {
        // Single page scene (e.g. page_18):
        // Exact 16:9 crop centered on characters (Ma calling out on left, Manu dancing in rain on right)
        let cropW = spreadW
        let cropHeight = spreadW * (9.0 / 16.0)
        let cropX: CGFloat = 0.0
        // Top-down yTop = 1180 gives 280px headroom above Ma & Manu faces (at yTop 1463),
        // capturing both faces, torsos, raincoat, and splashing feet down to yTop 2579
        let cropY = spreadH - (1180.0 + cropHeight)

        fullSpreadRep.draw(
            in: NSRect(x: 0, y: 0, width: finalPlateW, height: finalPlateH),
            from: NSRect(x: cropX, y: cropY, width: cropW, height: cropHeight),
            operation: .copy,
            fraction: 1.0,
            respectFlipped: false,
            hints: [.interpolation: NSImageInterpolation.high]
        )
    }

    NSGraphicsContext.restoreGraphicsState()

    // Pass 1: Inpaint any text remaining on the final canvas
    let inpaintedCount = inpaintPlate(rep: finalRep)

    // Pass 2: Verify with Vision OCR
    guard let outCG = finalRep.cgImage else { return }
    let verifyReq = VNRecognizeTextRequest()
    verifyReq.recognitionLevel = .accurate
    let verifyHandler = VNImageRequestHandler(cgImage: outCG, options: [:])
    try? verifyHandler.perform([verifyReq])

    let remainingTextCount = verifyReq.results?.count ?? 0

    let outUrl = URL(fileURLWithPath: "\(assetsDir)/\(sceneId).png")
    let pngData = finalRep.representation(using: .png, properties: [:])!
    try? pngData.write(to: outUrl)

    if remainingTextCount == 0 {
        print("✔ [\(sceneId)] 100% PURE ARTWORK (Clean crop + \(inpaintedCount) text boxes inpainted) -> \(outUrl.lastPathComponent)")
    } else {
        print("⚠️ [\(sceneId)] \(remainingTextCount) residual elements -> \(outUrl.lastPathComponent)")
    }
}

struct PageMapping: Decodable {
    let sceneId: String
    let left: String
    let right: String?
}

struct StoryManifest: Decodable {
    let pageMappings: [PageMapping]?
}

var sceneMappings: [(scene: String, left: String, right: String?)] = []

let manifestUrl = URL(fileURLWithPath: "\(storyDir)/story.json")
if let manifestData = try? Data(contentsOf: manifestUrl),
   let manifest = try? JSONDecoder().decode(StoryManifest.self, from: manifestData),
   let mappings = manifest.pageMappings, !mappings.isEmpty {
    sceneMappings = mappings.map { ($0.sceneId, $0.left, $0.right) }
    print("📖 Loaded \(sceneMappings.count) page mappings from \(manifestUrl.path)")
} else {
    sceneMappings = [
        ("cover", "page_01.png", nil),
        ("scene_01", "page_04.png", "page_05.png"),
        ("scene_02", "page_06.png", "page_07.png"),
        ("scene_03", "page_08.png", "page_09.png"),
        ("scene_04", "page_10.png", "page_11.png"),
        ("scene_05", "page_12.png", "page_13.png"),
        ("scene_06", "page_14.png", "page_15.png"),
        ("scene_07", "page_16.png", "page_17.png"),
        ("scene_08", "page_18.png", nil),
    ]
}

print("🎨 Running Smart Vision Text Exclusion & Local Inpainting Engine for \"\(bookSlug)\"...\n")
for item in sceneMappings {
    generateTextFreePlate(sceneId: item.scene, leftPage: item.left, rightPage: item.right)
}
print("\n🎉 Automated Text Exclusion Complete!")
