import Foundation
import PDFKit
import AppKit

// Usage: swift scripts/render-pdf-pages.swift <input.pdf> <outputDir>
let args = CommandLine.arguments
guard args.count >= 3, let doc = PDFDocument(url: URL(fileURLWithPath: args[1])) else {
    print("❌ Cannot open PDF")
    exit(1)
}
let outDir = args[2]
try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)
let requestedDpi: CGFloat = CommandLine.arguments.count > 3 ? (CGFloat(Double(CommandLine.arguments[3]) ?? 150.0)) : 150.0
let scale: CGFloat = requestedDpi / 72.0

for i in 0..<doc.pageCount {
    guard let page = doc.page(at: i) else { continue }
    let box = page.bounds(for: .mediaBox)
    let size = NSSize(width: box.width * scale, height: box.height * scale)
    let image = page.thumbnail(of: size, for: .mediaBox)
    guard let tiff = image.tiffRepresentation,
          let rep = NSBitmapImageRep(data: tiff),
          let png = rep.representation(using: .png, properties: [:]) else { continue }
    let name = String(format: "page_%02d.png", i + 1)
    try? png.write(to: URL(fileURLWithPath: "\(outDir)/\(name)"))
}
print("✔ Rendered \(doc.pageCount) pages")
