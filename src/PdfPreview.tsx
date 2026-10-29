import React, { useEffect, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
GlobalWorkerOptions.workerSrc = workerUrl;

// Fit the actual page to the available space; browser PDF toolbars no longer consume the review area.
export function PdfPreview({ url }: { url: string }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy>(),
    [error, setError] = useState(""),
    [zoom, setZoom] = useState(1),
    [page, setPage] = useState(1);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const viewport = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    setPdf(undefined);
    setError("");
    setPage(1);
    setZoom(1);
    const task = getDocument({ url });
    task.promise
      .then((doc) => {
        if (alive) setPdf(doc);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
      void task.destroy();
    };
  }, [url]);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!pdf || !canvas.current || !size.width || !size.height) return;
    let cancelled = false;
    let render:
      | ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>
      | undefined;
    pdf
      .getPage(page)
      .then(async (p) => {
        if (cancelled || !canvas.current) return;
        const original = p.getViewport({ scale: 1 });
        const scale =
          Math.max(
            0.1,
            Math.min(
              (size.width - 28) / original.width,
              (size.height - 28) / original.height,
            ),
          ) * zoom;
        const view = p.getViewport({ scale }),
          el = canvas.current,
          dpr = window.devicePixelRatio || 1;
        el.width = Math.ceil(view.width * dpr);
        el.height = Math.ceil(view.height * dpr);
        el.style.width = `${view.width}px`;
        el.style.height = `${view.height}px`;
        render = p.render({
          canvas: el,
          viewport: view,
          transform: [dpr, 0, 0, dpr, 0, 0],
        });
        await render.promise;
      })
      .catch((e) => {
        if (!cancelled && e.name !== "RenderingCancelledException")
          setError(e.message);
      });
    return () => {
      cancelled = true;
      render?.cancel();
    };
  }, [pdf, size, zoom, page]);
  return (
    <div className="pdf-preview">
      <div className="pdf-toolbar">
        <span>
          Page {page} of {pdf?.numPages || 1}
        </span>
        {pdf && pdf.numPages > 1 && (
          <>
            <button onClick={() => setPage((p) => p - 1)} disabled={page === 1}>
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page === pdf.numPages}
            >
              Next
            </button>
          </>
        )}
        <button onClick={() => setZoom(1)}>Fit page</button>
        <button
          aria-label="Zoom out document"
          disabled={zoom <= 0.6}
          onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}
        >
          −
        </button>
        <b>{Math.round(zoom * 100)}%</b>
        <button
          aria-label="Zoom in document"
          onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
        >
          +
        </button>
        <a href={url} target="_blank" rel="noreferrer">
          Open full screen ↗
        </a>
      </div>
      <div className="pdf-page-viewport" ref={viewport}>
        {error ? (
          <p>
            Preview unavailable.{" "}
            <a href={url} target="_blank" rel="noreferrer">
              Open document
            </a>
          </p>
        ) : (
          <>
            {!pdf && <p>Loading invoice…</p>}
            <canvas ref={canvas} aria-label="Draft invoice page" role="img" />
          </>
        )}
      </div>
    </div>
  );
}
