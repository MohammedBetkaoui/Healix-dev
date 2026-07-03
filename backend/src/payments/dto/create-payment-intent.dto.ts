import { IsEnum, IsString } from 'class-validator';

import { BillingPeriod } from '../../common/enums/billing-period.enum';
import { PaymentMethod } from '../../common/enums/payment-method.enum';

export class CreatePaymentIntentDto {
  @IsString()
  planId!: string;

  @IsEnum(BillingPeriod)
  billingPeriod!: BillingPeriod;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;
}
