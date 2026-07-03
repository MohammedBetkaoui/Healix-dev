import { Suspense } from "react";

import { BaridiMobReceiptUploadPage } from "@/components/payment/BaridiMobReceiptUploadPage";

export default function BaridiMobCheckoutRoute() {
  return (
    <Suspense fallback={null}>
      <BaridiMobReceiptUploadPage />
    </Suspense>
  );
}
