import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PrescriptionRegulatoryCategory,
  PrescriptionType,
} from '@prisma/client';

import { prescriptionBadRequest } from './prescription-errors';

const LEVEL: Record<PrescriptionType, number> = {
  STANDARD: 0,
  REGULATED: 1,
  PSYCHOTROPIC: 2,
  NARCOTIC: 3,
};

type RegulatoryInput = {
  acknowledgement?: boolean;
  carnetReference?: string;
  note?: string;
};

@Injectable()
export class PrescriptionRegulatoryService {
  private readonly requireCarnetReference: boolean;

  constructor(config: ConfigService) {
    this.requireCarnetReference =
      config.get<string>('PRESCRIPTION_REQUIRE_CARNET_REFERENCE') === 'true';
  }

  requiredType(
    requested: PrescriptionType | undefined,
    categories: PrescriptionRegulatoryCategory[],
  ): PrescriptionType {
    const itemType = categories.reduce<PrescriptionType>(
      (highest, category) =>
        LEVEL[category] > LEVEL[highest] ? category : highest,
      PrescriptionType.STANDARD,
    );
    const requestedType = requested ?? PrescriptionType.STANDARD;
    return LEVEL[requestedType] >= LEVEL[itemType] ? requestedType : itemType;
  }

  finalize(input: {
    requestedType: PrescriptionType;
    categories: PrescriptionRegulatoryCategory[];
    regulatoryData: unknown;
    prescriberRegistrationNumber: string;
  }) {
    const type = this.requiredType(input.requestedType, input.categories);
    const special = type !== PrescriptionType.STANDARD;
    const data = this.readData(input.regulatoryData);
    if (special && data.acknowledgement !== true) {
      throw prescriptionBadRequest(
        'REGULATORY_CONFIRMATION_REQUIRED',
        'La confirmation réglementaire est obligatoire pour cette ordonnance.',
      );
    }
    if (special && this.requireCarnetReference && !data.carnetReference) {
      throw prescriptionBadRequest(
        'REGULATORY_CARNET_REFERENCE_REQUIRED',
        'La référence du support réglementaire est obligatoire selon la configuration active.',
      );
    }
    return {
      category: type,
      supportRequired: special,
      carnetReference: data.carnetReference ?? null,
      prescriberRegistrationNumber: input.prescriberRegistrationNumber,
      acknowledgement: data.acknowledgement === true,
      note: data.note ?? null,
      disclaimer:
        'HealixDz ne remplace pas les supports réglementaires officiels exigés pour certaines substances.',
    };
  }

  private readData(value: unknown): RegulatoryInput {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return {};
    }
    const record = value as Record<string, unknown>;
    return {
      acknowledgement:
        typeof record.acknowledgement === 'boolean'
          ? record.acknowledgement
          : undefined,
      carnetReference:
        typeof record.carnetReference === 'string'
          ? record.carnetReference
          : undefined,
      note: typeof record.note === 'string' ? record.note : undefined,
    };
  }
}
