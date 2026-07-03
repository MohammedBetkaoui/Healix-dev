"use client";

import { ManualProofUploadPage } from "@/components/payment/ManualProofUploadPage";

export function BaridiMobReceiptUploadPage() {
  return (
    <ManualProofUploadPage
      proofType="BARIDIMOB_RECEIPT"
      variant="baridimob"
    />
  );
}
