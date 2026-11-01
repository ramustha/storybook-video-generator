import Foundation
import AppKit

let pagesDir = "stories/jas-hujan-merah/raw/pages"
let assetsDir = "stories/jas-hujan-merah/assets"

let sceneMappings: [(scene: String, left: String, right: String?)] = [
    ("cover", "page_01.png", nil),
    ("scene_01", "page_04.png", "page_05.png"),
    ("scene_02", "page_06.png", "page_07.png"),
    ("scene_03", "page_08.png", "page_09.png"),
    ("scene_04", "page_10.png", "page_11.png"),
    ("scene_05", "page_12.png", "page_13.png"),
    ("scene_06", "page_14.png", "page_15.png"),
    ("scene_07", "page_16.png", "page_17.png"),
    ("scene_08", "page_18.png", "page_19.png"),
]

let targetWidth: CGFloat = 1920
let targetHeight: CGFloat = 1080

for item in sceneMappings {
    let leftUrl = URL(fileURLWithPath: "\(pagesDir)/\(item.left)")
    guard let leftData = try? Data(contentsOf: leftUrl),
          let leftRep = NSBitmapImageRep(data: leftData) else {
        print("Failed to load \(leftUrl.path)")
        continue
    }

    let outRep = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: Int(targetWidth),
        pixelsHigh: Int(targetHeight),
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    )!

    NSGraphicsContext.saveGraphicsState()
    let context = NSGraphicsContext(bitmapImageRep: outRep)!
    NSGraphicsContext.current = context

    // Fill background with warm dark tone
    NSColor(calibratedRed: 0.05, green: 0.07, blue: 0.10, alpha: 1.0).setFill()
    NSRect(x: 0, y: 0, width: targetWidth, height: targetHeight).fill()

    if let rightName = item.right {
        // Two-page spread: stitch left and right together
        let rightUrl = URL(fileURLWithPath: "\(pagesDir)/\(rightName)")
        if let rightData = try? Data(contentsOf: rightUrl),
           let rightRep = NSBitmapImageRep(data: rightData) {
            let totalW = CGFloat(leftRep.pixelsWide + rightRep.pixelsWide)
            let maxH = CGFloat(max(leftRep.pixelsHigh, rightRep.pixelsHigh))

            // Scale to fill 1920x1080 (aspect fill)
            let scaleX = targetWidth / totalW
            let scaleY = targetHeight / maxH
            let fillScale = max(scaleX, scaleY)

            let scaledW = totalW * fillScale
            let scaledH = maxH * fillScale
            let offsetX = (targetWidth - scaledW) / 2.0
            let offsetY = (targetHeight - scaledH) / 2.0

            let leftW = CGFloat(leftRep.pixelsWide) * fillScale
            let rightW = CGFloat(rightRep.pixelsWide) * fillScale

            leftRep.draw(in: NSRect(x: offsetX, y: offsetY, width: leftW, height: scaledH))
            rightRep.draw(in: NSRect(x: offsetX + leftW, y: offsetY, width: rightW, height: scaledH))
        }
    } else {
        // Single cover page: center aspect fit or fill
        let srcW = CGFloat(leftRep.pixelsWide)
        let srcH = CGFloat(leftRep.pixelsHigh)
        let scale = min(targetWidth / srcW, targetHeight / srcH)
        let drawW = srcW * scale
        let drawH = srcH * scale
        let drawX = (targetWidth - drawW) / 2.0
        let drawY = (targetHeight - drawH) / 2.0
        leftRep.draw(in: NSRect(x: drawX, y: drawY, width: drawW, height: drawH))
    }

    NSGraphicsContext.restoreGraphicsState()

    let pngData = outRep.representation(using: .png, properties: [:])!
    let outUrl = URL(fileURLWithPath: "\(assetsDir)/\(item.scene).png")
    try! pngData.write(to: outUrl)
    print("✔ Created authentic 1080p plate: \(outUrl.lastPathComponent) (1920x1080)")
}

print("🎉 All 9 authentic storybook plates generated in assets/!")
