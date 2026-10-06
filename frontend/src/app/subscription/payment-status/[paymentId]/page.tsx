import { PaymentStatusPage } from "@/components/payment/PaymentStatusPage";

type PaymentStatusRouteProps = {
  params: Promise<{
    paymentId: string;
  }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function PaymentStatusRoute({
  params,
  searchParams,
}: PaymentStatusRouteProps) {
  const { paymentId } = await params;
  // Set by useCreatePaymentIntent when the backend answers
  // PAYMENT_ALREADY_PENDING (409) and redirects here.
  const { pending } = await searchParams;

  return (
    <PaymentStatusPage
      paymentId={paymentId}
      redirectedFromPendingPayment={pending === "1"}
    />
  );
}
