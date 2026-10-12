"use client";

import {
  CircleCheck,
  Contrast,
  FileImage,
  Layers,
  Maximize2,
  Minimize2,
  Move,
  RotateCcw,
  ScanLine,
  SlidersHorizontal,
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

/**
 * Drawn over the image, its opacity adjustable:
 * - "mask": a segmentation mask; its white areas take `color`;
 * - "image": a colour image shown as it is (the nuclei map), never recoloured.
 */
export type ImageViewerOverlay =
  | {
      kind: "mask";
      /** The mask image; a Blob gets its object URL created and revoked here. */
      src: Blob | string;
      /** 0 to 1. */
      opacity: number;
      color: string;
    }
  | {
      kind: "image";
      /** A transparent-background image of the image's size; a Blob gets its object URL here. */
      src: Blob | string;
      /** 0 to 1. */
      opacity: number;
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
  const overlayImageRef = useRef<HTMLImageElement>(null);
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

  // Same for the overlay, set on the element itself: under Strict Mode the
  // effect runs, is cleaned up (URL revoked) and runs again with a new URL.
  const overlaySrc = overlay?.src;
  const overlayKind = overlay?.kind;
  useEffect(() => {
    if (!overlaySrc) {
      return;
    }

    const url = typeof overlaySrc === "string" ? overlaySrc : URL.createObjectURL(overlaySrc);
    const revoke = () => {
      if (typeof overlaySrc !== "string") {
        URL.revokeObjectURL(url);
      }
    };

    if (overlayKind === "image") {
      const image = overlayImageRef.current;
      if (!image) {
        revoke();
        return;
      }
      image.src = url;
      return () => {
        image.removeAttribute("src");
        revoke();
      };
    }

    const element = overlayRef.current;
    if (!element) {
      revoke();
      return;
    }
    element.style.maskImage = `url("${url}")`;
    element.style.setProperty("-webkit-mask-image", `url("${url}")`);

    return () => {
      element.style.maskImage = "";
      element.style.removeProperty("-webkit-mask-image");
      revoke();
    };
  }, [overlayKind, overlaySrc]);

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
  // A map (image overlay) is named as such; a mask keeps its own words.
  const overlayLabels = overlay?.kind === "image"
    ? { opacity: t("aiAnalyses.viewer.mapOpacity"), show: t("aiAnalyses.viewer.showMap") }
    : { opacity: t("aiAnalyses.viewer.overlayOpacity"), show: t("aiAnalyses.viewer.showOverlay") };

  return (
    <figure
      ref={figureRef}
      className="ai-viewer"
      data-module={module}
      data-image-ready={hasImage || undefined}
      dir="ltr"
      aria-label={t("aiAnalyses.viewer.label", { name: fileName })}
    >
      <header className="ai-viewer-header">
        <div className="ai-viewer-heading">
          <span className="ai-viewer-mark" aria-hidden="true">
            <ScanLine size={18} strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <p className="ai-viewer-eyebrow">{t("aiAnalyses.viewer.workspace")}</p>
            <bdi className="ai-viewer-title">{fileName}</bdi>
          </div>
        </div>
        <span className="ai-viewer-state" data-ready={hasImage || undefined}>
          {hasImage ? <CircleCheck size={14} strokeWidth={2} aria-hidden="true" /> : <span className="ai-viewer-state-dot" aria-hidden="true" />}
          {hasImage ? t("aiAnalyses.viewer.ready") : t("aiAnalyses.viewer.waiting")}
        </span>
      </header>

      <div
        role="group"
        aria-label={t("aiAnalyses.viewer.controls")}
        className="ai-viewer-controls"
      >
        <div className="ai-viewer-control-cluster ai-viewer-navigation">
          <span className="ai-viewer-control-label"><Move size={13} strokeWidth={1.8} aria-hidden="true" />{t("aiAnalyses.viewer.navigation")}</span>
          <div className="ai-viewer-control-row">
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
            <span className="ai-viewer-divider" aria-hidden="true" />
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
        </div>

        <div className="ai-viewer-control-cluster ai-viewer-adjustments">
          <span className="ai-viewer-control-label"><SlidersHorizontal size={13} strokeWidth={1.8} aria-hidden="true" />{t("aiAnalyses.viewer.adjustments")}</span>
          <div className="ai-viewer-adjustment-row">
            <label className="ai-viewer-slider">
              <SunMedium size={16} strokeWidth={1.8} aria-hidden="true" />
              <span>{t("aiAnalyses.viewer.brightness")}</span>
              <input type="range" min={VIEWER_FILTER_MIN} max={VIEWER_FILTER_MAX} step={5} value={state.brightness} disabled={!hasImage} aria-valuetext={`${state.brightness} %`} onChange={(event) => dispatch({ type: "setBrightness", value: Number(event.target.value) })} />
              <output className="ai-viewer-mono">{state.brightness} %</output>
            </label>
            <label className="ai-viewer-slider">
              <Contrast size={16} strokeWidth={1.8} aria-hidden="true" />
              <span>{t("aiAnalyses.viewer.contrast")}</span>
              <input type="range" min={VIEWER_FILTER_MIN} max={VIEWER_FILTER_MAX} step={5} value={state.contrast} disabled={!hasImage} aria-valuetext={`${state.contrast} %`} onChange={(event) => dispatch({ type: "setContrast", value: Number(event.target.value) })} />
              <output className="ai-viewer-mono">{state.contrast} %</output>
            </label>
          </div>
        </div>

        {overlay ? (
          <div className="ai-viewer-control-cluster ai-viewer-overlay-controls">
            <span className="ai-viewer-control-label"><Layers size={13} strokeWidth={1.8} aria-hidden="true" />{overlayLabels.show}</span>
            <div className="ai-viewer-control-row">
              <button
                type="button"
                role="switch"
                aria-checked={isOverlayVisible}
                className="ai-viewer-button ai-viewer-overlay-toggle"
                onClick={() => setOverlayVisible((visible) => !visible)}
              >
                <Layers size={16} strokeWidth={1.8} aria-hidden="true" />
                {overlayLabels.show}
              </button>
              <label className="ai-viewer-slider">
                <span>{overlayLabels.opacity}</span>
                <input type="range" min={0} max={100} step={5} value={Math.round(overlayOpacity * 100)} disabled={!isOverlayVisible} aria-valuetext={`${Math.round(overlayOpacity * 100)} %`} onChange={(event) => setOverlayOpacity(Number(event.target.value) / 100)} />
                <output className="ai-viewer-mono">{Math.round(overlayOpacity * 100)} %</output>
              </label>
            </div>
          </div>
        ) : null}
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
        <div className="ai-viewer-focus-frame" aria-hidden="true" />
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
          {/* Kept mounted (hidden when switched off) so its URL lives as long
              as the overlay, not as long as one display. Outside the image's
              filter: brightness, contrast and inversion leave it as it is. */}
          {overlay?.kind === "mask" ? (
            <div
              ref={overlayRef}
              aria-hidden="true"
              className="ai-viewer-overlay"
              hidden={!isOverlayVisible}
              style={{ backgroundColor: overlay.color, opacity: overlayOpacity }}
            />
          ) : overlay?.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob: URL, next/image cannot optimize it
            <img
              ref={overlayImageRef}
              alt=""
              aria-hidden="true"
              className="ai-viewer-overlay-image"
              draggable={false}
              hidden={!isOverlayVisible}
              style={{ opacity: overlayOpacity }}
            />
          ) : null}
        </div>
        {hasImage ? null : <div className="ai-viewer-placeholder">{placeholder}</div>}
        {hasImage ? <div className="ai-viewer-interaction-hint"><Move size={13} strokeWidth={1.8} aria-hidden="true" />{t("aiAnalyses.viewer.interactionHint")}</div> : null}
      </div>

      <figcaption className="ai-viewer-status ai-viewer-mono">
        <span className="ai-viewer-status-file"><FileImage size={14} strokeWidth={1.8} aria-hidden="true" /><bdi className="min-w-0 truncate">{fileName}</bdi></span>
        <span className="ai-viewer-status-metrics">
          <span>{size ? t("aiAnalyses.viewer.dimensions", { height: size.height, width: size.width }) : t("aiAnalyses.viewer.dimensionsUnknown")}</span>
          <span aria-hidden="true">·</span>
          <span>{zoomLabel}</span>
        </span>
      </figcaption>
      <p id={helpId} className="sr-only">{t("aiAnalyses.viewer.shortcuts")}</p>
    </figure>
  );
}
