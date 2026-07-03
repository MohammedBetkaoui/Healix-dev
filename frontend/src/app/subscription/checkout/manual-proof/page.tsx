import { Suspense } from "react";

import { ManualProofUploadPage } from "@/components/payment/ManualProofUploadPage";

export default function ManualProofCheckoutRoute() {
  return (
    <Suspense fallback={null}>
      <ManualProofUploadPage
        proofType="POST_TRANSFER_PROOF"
        variant="manual"
      />
    </Suspense>
  );
}
