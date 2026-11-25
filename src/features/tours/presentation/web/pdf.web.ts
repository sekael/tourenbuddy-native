/** PDF.js, loaded on first use; its worker is served from `public/` (copied by postinstall). */
export interface PdfViewport {
  width: number;
  height: number;
}
interface PdfPage {
  getViewport: (opts: { scale: number }) => PdfViewport;
  render: (opts: {
    canvasContext: CanvasRenderingContext2D;
    canvas: HTMLCanvasElement;
    viewport: PdfViewport;
  }) => { promise: Promise<void> };
}
export interface PdfDocument {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
}

export async function openPdf(url: string): Promise<PdfDocument> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs?v=${pdfjs.version}`;
  // The full proxy carries far more than the members used here: widen through `unknown`.
  return (await pdfjs.getDocument(url).promise) as unknown as PdfDocument;
}

/** Draws page `n` into `canvas` at `scale`. */
export async function renderPdfPage(
  doc: PdfDocument,
  n: number,
  canvas: HTMLCanvasElement,
  scale: (natural: PdfViewport) => number,
) {
  const page = await doc.getPage(n);
  const viewport = page.getViewport({ scale: scale(page.getViewport({ scale: 1 })) });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d')!, canvas, viewport }).promise;
}

/** The first page as a 160 px thumbnail (a data URL). */
export async function renderPdfThumbnail(url: string): Promise<string> {
  const doc = await openPdf(url);
  const canvas = document.createElement('canvas');
  await renderPdfPage(doc, 1, canvas, (natural) => 160 / Math.min(natural.width, natural.height));
  return canvas.toDataURL('image/png');
}
