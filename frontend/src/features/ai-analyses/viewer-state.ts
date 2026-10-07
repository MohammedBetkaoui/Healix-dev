// Pure state of the image viewer (components/ai-analyses/viewer): zoom, pan
// and display filters. Kept free of React and the DOM so it is unit-tested.

/** Zoom is relative to the image fitted in the viewport (1 = 100 %). */
export const VIEWER_MIN_ZOOM = 0.25;
export const VIEWER_MAX_ZOOM = 8;
/** Multiplier of one zoom button press or +/- key press. */
export const VIEWER_ZOOM_STEP = 1.25;
/** Multiplier of one mouse wheel notch. */
export const VIEWER_WHEEL_STEP = 1.1;
/** Pixels moved by one arrow key press. */
export const VIEWER_PAN_STEP = 40;
/** Brightness and contrast, in percent of the original (CSS filters). */
export const VIEWER_FILTER_MIN = 0;
export const VIEWER_FILTER_MAX = 200;

export type ViewerState = {
  zoom: number;
  panX: number;
  panY: number;
  brightness: number;
  contrast: number;
  inverted: boolean;
};

export const initialViewerState: ViewerState = {
  zoom: 1,
  panX: 0,
  panY: 0,
  brightness: 100,
  contrast: 100,
  inverted: false,
};

export type ViewerAction =
  | { type: "zoomIn" }
  | { type: "zoomOut" }
  | { type: "zoomBy"; factor: number }
  | { type: "pan"; dx: number; dy: number }
  | { type: "setBrightness"; value: number }
  | { type: "setContrast"; value: number }
  | { type: "toggleInvert" }
  | { type: "reset" };

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) {
    return initialViewerState.zoom;
  }

  return Math.min(VIEWER_MAX_ZOOM, Math.max(VIEWER_MIN_ZOOM, zoom));
}

function clampFilter(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(VIEWER_FILTER_MAX, Math.max(VIEWER_FILTER_MIN, Math.round(value)));
}

export function viewerReducer(state: ViewerState, action: ViewerAction): ViewerState {
  switch (action.type) {
    case "zoomIn":
      return { ...state, zoom: clampZoom(state.zoom * VIEWER_ZOOM_STEP) };
    case "zoomOut":
      return { ...state, zoom: clampZoom(state.zoom / VIEWER_ZOOM_STEP) };
    case "zoomBy":
      return { ...state, zoom: clampZoom(state.zoom * action.factor) };
    case "pan":
      return { ...state, panX: state.panX + action.dx, panY: state.panY + action.dy };
    case "setBrightness":
      return { ...state, brightness: clampFilter(action.value, state.brightness) };
    case "setContrast":
      return { ...state, contrast: clampFilter(action.value, state.contrast) };
    case "toggleInvert":
      return { ...state, inverted: !state.inverted };
    case "reset":
      return initialViewerState;
  }
}

/**
 * Keyboard shortcuts of the focused viewport. Arrows move the view (the image
 * shifts the other way), like a map. Returns null for any other key.
 */
export function keyToViewerAction(key: string): ViewerAction | null {
  switch (key) {
    case "+":
    case "=":
      return { type: "zoomIn" };
    case "-":
    case "_":
      return { type: "zoomOut" };
    case "0":
      return { type: "reset" };
    case "i":
    case "I":
      return { type: "toggleInvert" };
    case "ArrowLeft":
      return { type: "pan", dx: VIEWER_PAN_STEP, dy: 0 };
    case "ArrowRight":
      return { type: "pan", dx: -VIEWER_PAN_STEP, dy: 0 };
    case "ArrowUp":
      return { type: "pan", dx: 0, dy: VIEWER_PAN_STEP };
    case "ArrowDown":
      return { type: "pan", dx: 0, dy: -VIEWER_PAN_STEP };
    default:
      return null;
  }
}

/** CSS filter of the displayed image. */
export function toViewerFilter(state: ViewerState): string {
  return `brightness(${state.brightness}%) contrast(${state.contrast}%)${state.inverted ? " invert(1)" : ""}`;
}

/** CSS transform of the image stage (pan in screen pixels, then zoom). */
export function toViewerTransform(state: ViewerState): string {
  return `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
}
