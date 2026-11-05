import Foundation
import AppKit
import PDFKit
import Vision

let pdfPath = "stories/bulan-dan-topi-biru/raw/source-book.pdf"
let outDir = "stories/bulan-dan-topi-biru/raw/pages"

try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

guard let doc = PDFDocument(url: URL(fileURLWithPath: pdfPath)) else {
    print("❌ Failed to open PDF at \(pdfPath)")
    exit(1)
}

print("📖 Opened PDF: \(doc.pageCount) pages")

for i in 0..<doc.pageCount {
    guard let page = doc.page(at: i) else { continue }
    let pageBounds = page.bounds(for: .mediaBox)
    
    // Scale 2x for sharp resolution
    let scale: CGFloat = 2.0
    let pixelWidth = Int(pageBounds.width * scale)
    let pixelHeight = Int(pageBounds.height * scale)
    
    guard let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: pixelWidth,
        pixelsHigh: pixelHeight,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .calibratedRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    ) else { continue }
    
    NSGraphicsContext.saveGraphicsState()
    if let ctx = NSGraphicsContext(bitmapImageRep: rep) {
        NSGraphicsContext.current = ctx
        ctx.cgContext.setFillColor(NSColor.white.cgColor)
        ctx.cgContext.fill(CGRect(x: 0, y: 0, width: pixelWidth, height: pixelHeight))
        ctx.cgContext.scaleBy(x: scale, y: scale)
        page.draw(with: .mediaBox, to: ctx.cgContext)
    }
    NSGraphicsContext.restoreGraphicsState()
    
    let fileName = String(format: "page_%02d.png", i + 1)
    let outUrl = URL(fileURLWithPath: "\(outDir)/\(fileName)")
    if let pngData = rep.representation(using: .png, properties: [:]) {
        try? pngData.write(to: outUrl)
    }
    
    // Vision OCR text extraction
    if let cgImage = rep.cgImage {
        let req = VNRecognizeTextRequest()
        req.recognitionLevel = .accurate
        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        try? handler.perform([req])
        let texts = (req.results ?? []).map { $0.topCandidates(1).first?.string ?? "" }
        let textSample = texts.joined(separator: " ")
        print("[\(fileName)] (\(pixelWidth)x\(pixelHeight)): \(textSample)")
    }
}

print("✔ Extracted all \(doc.pageCount) pages to \(outDir)")
