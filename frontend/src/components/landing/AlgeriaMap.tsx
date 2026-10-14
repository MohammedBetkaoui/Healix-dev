import { HIGHLIGHTED_WILAYAS, WILAYA_CENTERS, WILAYA_NAMES, WILAYA_PATHS } from "./algeria-wilayas";
import styles from "./landing.module.css";

const WILAYA_IDS = Object.keys(WILAYA_PATHS).sort();

/**
 * Institutional Algeria map — 58 wilaya geometries adapted from
 * anisbl/map_of_algeria (https://github.com/anisbl/map_of_algeria).
 * Non-interactive: Alger, Oran and Constantine are highlighted,
 * all styling stays in the HealixDz Design System.
 */
export function AlgeriaMap() {
  return (
    <svg viewBox="0 0 1000 1000" role="img" aria-label="Carte de l'Algérie — 58 wilayas">
      {WILAYA_IDS.map((id) => (
        <path
          key={id}
          d={WILAYA_PATHS[id]}
          className={HIGHLIGHTED_WILAYAS.includes(id) ? styles.wilayaHighlight : undefined}
        >
          {WILAYA_NAMES[id] ? <title>{WILAYA_NAMES[id]}</title> : null}
        </path>
      ))}
      {HIGHLIGHTED_WILAYAS.map((id) => {
        const center = WILAYA_CENTERS[id];
        if (!center) return null;
        return (
          <circle key={id} cx={center.x} cy={center.y} r={10} className={styles.wilayaDot}>
            {WILAYA_NAMES[id] ? <title>{WILAYA_NAMES[id]}</title> : null}
          </circle>
        );
      })}
    </svg>
  );
}
