import Foundation
import PDFKit
import AppKit

guard CommandLine.arguments.count >= 3 else {
    print("Usage: swift extract-pdf-pages.swift <input.pdf> <output_dir> [scale]")
    exit(1)
}

let pdfPath = CommandLine.arguments[1]
let outputDir = CommandLine.arguments[2]
let scale = CommandLine.arguments.count >= 4 ? Double(CommandLine.arguments[3])! : 2.5

guard let pdfDoc = PDFDocument(url: URL(fileURLWithPath: pdfPath)) else {
    print("Failed to open PDF: \(pdfPath)")
    exit(1)
}

let pageCount = pdfDoc.pageCount
print("📖 Total pages in PDF: \(pageCount)")

for i in 0..<pageCount {
    guard let page = pdfDoc.page(at: i) else { continue }
    let bounds = page.bounds(for: .mediaBox)
    let size = CGSize(width: bounds.width * scale, height: bounds.height * scale)
    let image = page.thumbnail(of: size, for: .mediaBox)
    if let tiffData = image.tiffRepresentation,
       let bitmap = NSBitmapImageRep(data: tiffData),
       let pngData = bitmap.representation(using: .png, properties: [:]) {
        let outPath = URL(fileURLWithPath: outputDir).appendingPathComponent(String(format: "page_%02d.png", i + 1))
        do {
            try pngData.write(to: outPath)
            print("  ✔ Page \(i + 1) -> \(outPath.lastPathComponent) (\(Int(size.width))x\(Int(size.height)))")
        } catch {
            print("  ❌ Failed to write page \(i + 1): \(error)")
        }
    }
}
print("🎉 All pages successfully extracted!")
