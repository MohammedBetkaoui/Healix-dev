import { Suspense } from "react";

import { SyntheticChargilyPaymentPage } from "@/components/payment/SyntheticChargilyPaymentPage";

export default function SyntheticChargilyCheckoutRoute() {
  return (
    <Suspense fallback={null}>
      <SyntheticChargilyPaymentPage />
    </Suspense>
  );
}
