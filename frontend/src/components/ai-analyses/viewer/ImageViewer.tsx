"use client";

import {
  Contrast,
  Layers,
  Maximize2,
  Minimize2,
  RotateCcw,
  SunMedium,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";

import { type AiModule } from "@/features/ai-analyses/ai-analyses.types";
import {
  initialViewerState,
  keyToViewerAction,
  toViewerFilter,
  toViewerTransform,
  VIEWER_FILTER_MAX,
  VIEWER_FILTER_MIN,
  VIEWER_WHEEL_STEP,
  viewerReducer,
} from "@/features/ai-analyses/viewer-state";
import { type TranslationFunction } from "@/lib/i18n";

/** Future segmentation mask drawn over the image; white areas of `src` take `color`. */
export type ImageViewerOverlay = {
  /** The mask image; a Blob gets its object URL created and revoked here. */
  src: Blob | string;
  /** 0 to 1. */
  opacity: number;
  color: string;
};

type ImageViewerProps = {
  /** The image file; null while loading or when it cannot be shown. */
  blob: Blob | null;
  fileName: string;
  module: AiModule;
  /** Shown in place of the image when there is no blob (loading, error, DICOM). */
  placeholder?: ReactNode;
  overlay?: ImageViewerOverlay;
  t: TranslationFunction;
};

const shortcuts = "+ - 0 I ArrowUp ArrowDown ArrowLeft ArrowRight";

// Reading viewer: always on a dark background, whatever the theme. Commands
// stay left-to-right in Arabic too (they act on the image, not on the text).
export function ImageViewer({ blob, fileName, module, overlay, placeholder, t }: ImageViewerProps) {
  const id = useId();
  const helpId = `${id}-help`;
  const viewportId = `${id}-viewport`;
  const figureRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [state, dispatch] = useReducer(viewerReducer, initialViewerState);
  const [natural, setNatural] = useState<{ blob: Blob; height: number; width: number } | null>(null);
  const [isFullscreen, setFullscreen] = useState(false);
  const [isDragging, setDragging] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState(overlay?.opacity ?? 0.4);
  const [isOverlayVisible, setOverlayVisible] = useState(true);

  // The blob is shown through an object URL set on the <img> directly and
  // revoked when the blob changes or the viewer unmounts.
  useEffect(() => {
    const image = imageRef.current;

    if (!image || !blob) {
      return;
    }

    const url = URL.createObjectURL(blob);
    image.src = url;

    return () => {
      image.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
  }, [blob]);

  // Same for the overlay mask, set on the element itself: under Strict Mode
  // the effect runs, is cleaned up (URL revoked) and runs again with a new URL.
  const overlaySrc = overlay?.src;
  useEffect(() => {
    const element = overlayRef.current;

    if (!element || !overlaySrc) {
      return;
    }

    const url = typeof overlaySrc === "string" ? overlaySrc : URL.createObjectURL(overlaySrc);
    element.style.maskImage = `url("${url}")`;
    element.style.setProperty("-webkit-mask-image", `url("${url}")`);

    return () => {
      element.style.maskImage = "";
      element.style.removeProperty("-webkit-mask-image");
      if (typeof overlaySrc !== "string") {
        URL.revokeObjectURL(url);
      }
    };
  }, [overlaySrc]);

  // Wheel zoom needs preventDefault, which React's (passive) onWheel ignores.
  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport || !blob) {
      return;
    }

    const onWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) {
        return;
      }

      event.preventDefault();
      dispatch({ type: "zoomBy", factor: event.deltaY < 0 ? VIEWER_WHEEL_STEP : 1 / VIEWER_WHEEL_STEP });
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [blob]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === figureRef.current);

    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void figureRef.current?.requestFullscreen();
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!blob || event.button !== 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    dispatch({ type: "pan", dx: event.clientX - drag.x, dy: event.clientY - drag.y });
    dragRef.current = { ...drag, x: event.clientX, y: event.clientY };
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      setDragging(false);
    }
  };

  const size = blob && natural?.blob === blob ? natural : null;
  const zoomLabel = `${Math.round(state.zoom * 100)} %`;
  const hasImage = Boolean(blob);

  return (
    <figure
      ref={figureRef}
      className="ai-viewer"
      data-module={module}
      dir="ltr"
      aria-label={t("aiAnalyses.viewer.label", { name: fileName })}
    >
      <div
        role="group"
        aria-label={t("aiAnalyses.viewer.controls")}
        className="ai-viewer-controls"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className="ai-viewer-button" aria-label={t("aiAnalyses.viewer.zoomOut")} title={t("aiAnalyses.viewer.zoomOut")} aria-controls={viewportId} disabled={!hasImage} onClick={() => dispatch({ type: "zoomOut" })}>
            <ZoomOut size={17} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <output className="ai-viewer-readout ai-viewer-mono" aria-live="polite">
            <span className="sr-only">{t("aiAnalyses.viewer.zoom")} </span>
            {zoomLabel}
          </output>
          <button type="button" className="ai-viewer-button" aria-label={t("aiAnalyses.viewer.zoomIn")} title={t("aiAnalyses.viewer.zoomIn")} aria-controls={viewportId} disabled={!hasImage} onClick={() => dispatch({ type: "zoomIn" })}>
            <ZoomIn size={17} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <button type="button" className="ai-viewer-button" aria-label={t("aiAnalyses.viewer.reset")} title={t("aiAnalyses.viewer.reset")} aria-controls={viewportId} disabled={!hasImage} onClick={() => dispatch({ type: "reset" })}>
            <RotateCcw size={17} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <button type="button" className="ai-viewer-button" aria-label={t("aiAnalyses.viewer.invert")} title={t("aiAnalyses.viewer.invert")} aria-pressed={state.inverted} aria-controls={viewportId} disabled={!hasImage} onClick={() => dispatch({ type: "toggleInvert" })}>
            <Contrast size={17} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <button type="button" className="ai-viewer-button" aria-label={isFullscreen ? t("aiAnalyses.viewer.exitFullscreen") : t("aiAnalyses.viewer.fullscreen")} title={isFullscreen ? t("aiAnalyses.viewer.exitFullscreen") : t("aiAnalyses.viewer.fullscreen")} onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize2 size={17} strokeWidth={1.8} aria-hidden="true" /> : <Maximize2 size={17} strokeWidth={1.8} aria-hidden="true" />}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="ai-viewer-slider">
            <SunMedium size={16} strokeWidth={1.8} aria-hidden="true" />
            <span>{t("aiAnalyses.viewer.brightness")}</span>
            <input type="range" min={VIEWER_FILTER_MIN} max={VIEWER_FILTER_MAX} step={5} value={state.brightness} disabled={!hasImage} aria-valuetext={`${state.brightness} %`} onChange={(event) => dispatch({ type: "setBrightness", value: Number(event.target.value) })} />
            <span className="ai-viewer-mono w-12 text-end">{state.brightness} %</span>
          </label>
          <label className="ai-viewer-slider">
            <Contrast size={16} strokeWidth={1.8} aria-hidden="true" />
            <span>{t("aiAnalyses.viewer.contrast")}</span>
            <input type="range" min={VIEWER_FILTER_MIN} max={VIEWER_FILTER_MAX} step={5} value={state.contrast} disabled={!hasImage} aria-valuetext={`${state.contrast} %`} onChange={(event) => dispatch({ type: "setContrast", value: Number(event.target.value) })} />
            <span className="ai-viewer-mono w-12 text-end">{state.contrast} %</span>
          </label>
          {overlay ? (
            <>
              <button
                type="button"
                role="switch"
                aria-checked={isOverlayVisible}
                className="ai-viewer-button gap-2 text-xs"
                onClick={() => setOverlayVisible((visible) => !visible)}
              >
                <Layers size={16} strokeWidth={1.8} aria-hidden="true" />
                {t("aiAnalyses.viewer.showOverlay")}
              </button>
              <label className="ai-viewer-slider">
                <span>{t("aiAnalyses.viewer.overlayOpacity")}</span>
                <input type="range" min={0} max={100} step={5} value={Math.round(overlayOpacity * 100)} disabled={!isOverlayVisible} aria-valuetext={`${Math.round(overlayOpacity * 100)} %`} onChange={(event) => setOverlayOpacity(Number(event.target.value) / 100)} />
                <span className="ai-viewer-mono w-12 text-end">{Math.round(overlayOpacity * 100)} %</span>
              </label>
            </>
          ) : null}
        </div>
      </div>

      <div
        ref={viewportRef}
        id={viewportId}
        className="ai-viewer-viewport"
        data-dragging={isDragging || undefined}
        tabIndex={hasImage ? 0 : -1}
        role="group"
        aria-roledescription={t("aiAnalyses.viewer.roleDescription")}
        aria-label={fileName}
        aria-describedby={helpId}
        aria-keyshortcuts={shortcuts}
        onKeyDown={(event) => {
          if (!hasImage || event.ctrlKey || event.metaKey || event.altKey) {
            return;
          }

          const action = keyToViewerAction(event.key);

          if (action) {
            event.preventDefault();
            dispatch(action);
          }
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="ai-viewer-stage" style={{ transform: toViewerTransform(state) }} hidden={!hasImage}>
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob: URL, next/image cannot optimize it */}
          <img
            ref={imageRef}
            alt={fileName}
            className="ai-viewer-image"
            draggable={false}
            style={{ filter: toViewerFilter(state) }}
            onLoad={(event) => {
              if (blob) {
                setNatural({ blob, height: event.currentTarget.naturalHeight, width: event.currentTarget.naturalWidth });
              }
            }}
          />
          {overlay ? (
            // Kept mounted (hidden when switched off) so its mask URL lives
            // as long as the overlay, not as long as one display.
            <div
              ref={overlayRef}
              aria-hidden="true"
              className="ai-viewer-overlay"
              hidden={!isOverlayVisible}
              style={{ backgroundColor: overlay.color, opacity: overlayOpacity }}
            />
          ) : null}
        </div>
        {hasImage ? null : <div className="ai-viewer-placeholder">{placeholder}</div>}
      </div>

      <figcaption className="ai-viewer-status ai-viewer-mono">
        <span>{size ? t("aiAnalyses.viewer.dimensions", { height: size.height, width: size.width }) : t("aiAnalyses.viewer.dimensionsUnknown")}</span>
        <span aria-hidden="true">·</span>
        <span>{zoomLabel}</span>
        <span aria-hidden="true">·</span>
        <bdi className="min-w-0 truncate">{fileName}</bdi>
      </figcaption>
      <p id={helpId} className="sr-only">{t("aiAnalyses.viewer.shortcuts")}</p>
    </figure>
  );
}
