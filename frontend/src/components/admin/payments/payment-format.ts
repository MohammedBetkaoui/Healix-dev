import { formatPlanAmount } from "@/components/subscription/subscription-format";

// Same amount format as the subscription screens ("14 900 DA"); payments are
// stored in DZD, shown with the usual "DA" suffix.
export function formatPaymentAmount(amount: number, currency: string) {
  return `${formatPlanAmount(amount)} ${currency === "DZD" ? "DA" : currency}`;
}
