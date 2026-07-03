import { PaymentStatusPage } from "@/components/payment/PaymentStatusPage";

type PaymentStatusRouteProps = {
  params: Promise<{
    paymentId: string;
  }>;
};

export default async function PaymentStatusRoute({
  params,
}: PaymentStatusRouteProps) {
  const { paymentId } = await params;

  return <PaymentStatusPage paymentId={paymentId} />;
}
