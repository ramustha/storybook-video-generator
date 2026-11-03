import Foundation
import AppKit
import Vision

let pagesDir = "stories/hari-cukur-rambut/raw/pages"
let fm = FileManager.default
let files = (try? fm.contentsOfDirectory(atPath: pagesDir).filter { $0.hasSuffix(".png") }.sorted()) ?? []

for f in files {
    let url = URL(fileURLWithPath: "\(pagesDir)/\(f)")
    guard let data = try? Data(contentsOf: url),
          let rep = NSBitmapImageRep(data: data),
          let cgImage = rep.cgImage else { continue }
    
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    try? handler.perform([req])
    let texts = (req.results ?? []).map { $0.topCandidates(1).first?.string ?? "" }
    let sample = texts.joined(separator: " // ")
    print("[\(f)] (\(rep.pixelsWide)x\(rep.pixelsHigh)): \(sample)")
}
