import type { ProductScreenUi } from "./ProductScreen";
import { ProductScreen } from "./ProductScreen";
import styles from "./landing.module.css";

type ProductMockupProps = {
  description: string;
  points: readonly string[];
  stat: string;
  title: string;
  ui: ProductScreenUi;
  variant?: "doctor" | "establishment";
};

export function ProductMockup({
  description,
  points,
  stat,
  title,
  ui,
  variant = "establishment",
}: ProductMockupProps) {
  return (
    <div className={styles.audienceMockup}>
      <ProductScreen
        data={{
          annotation: description,
          id: variant === "doctor" ? "patient" : "dashboard",
          label: title,
          rows: points.slice(0, 4),
          stat,
          title,
        }}
        ui={ui}
      />
    </div>
  );
}
