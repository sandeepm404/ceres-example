// Rasterize every page of a PDF to PNG with macOS PDFKit (no poppler needed).
//
//   swift .agent/skills/print-page-fit/pdf2png.swift in.pdf out/prefix
//   -> out/prefix-1.png, out/prefix-2.png, …   (prints the page count)
import AppKit
import PDFKit

let args = CommandLine.arguments
guard args.count == 3, let doc = PDFDocument(url: URL(fileURLWithPath: args[1])) else {
  FileHandle.standardError.write("usage: pdf2png.swift <in.pdf> <out-prefix>\n".data(using: .utf8)!)
  exit(2)
}
let scale: CGFloat = 1.5
for i in 0..<doc.pageCount {
  let page = doc.page(at: i)!
  let box = page.bounds(for: .mediaBox)
  let size = NSSize(width: box.width * scale, height: box.height * scale)
  let image = NSImage(size: size)
  image.lockFocus()
  NSColor.white.set()
  NSRect(origin: .zero, size: size).fill()
  let ctx = NSGraphicsContext.current!.cgContext
  ctx.scaleBy(x: scale, y: scale)
  page.draw(with: .mediaBox, to: ctx)
  image.unlockFocus()
  let png = NSBitmapImageRep(data: image.tiffRepresentation!)!.representation(using: .png, properties: [:])!
  try! png.write(to: URL(fileURLWithPath: "\(args[2])-\(i + 1).png"))
}
print(doc.pageCount)
