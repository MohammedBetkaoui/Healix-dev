import { Injectable } from '@nestjs/common';
import { PrescriptionRegulatoryCategory } from '@prisma/client';

type SafetyItem = {
  dci: string;
  strength: string;
  pharmaceuticalForm: string;
  regulatoryCategory: PrescriptionRegulatoryCategory;
  dosePerIntake: string;
  frequency: string;
  durationDays: number | null;
  quantity: string;
};

export type PrescriptionSafetyAlert = {
  id: string;
  kind:
    | 'ALLERGY'
    | 'DUPLICATION'
    | 'DURATION'
    | 'DOSAGE'
    | 'REGULATED'
    | 'MISSING_CONTEXT';
  level: 'information' | 'attention' | 'critical';
  title: string;
  detail?: string;
  resolved: boolean;
};

type MedicalSummary = {
  allergies?: unknown;
  chronicDiseases?: unknown;
  currentMedications?: unknown;
  history?: unknown;
  notes?: unknown;
};

const normalize = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('fr');

@Injectable()
export class PrescriptionSafetyService {
  evaluate(items: SafetyItem[], medicalSummary: unknown) {
    const alerts: PrescriptionSafetyAlert[] = [];
    const seen = new Map<string, number>();
    const summary = this.readSummary(medicalSummary);
    const allergies = this.stringArray(summary?.allergies).map(normalize);

    items.forEach((item, index) => {
      const duplicateKey = [
        normalize(item.dci),
        normalize(item.strength),
        item.pharmaceuticalForm,
      ].join('|');
      const previous = seen.get(duplicateKey);
      if (previous !== undefined) {
        alerts.push({
          id: `duplication-${index + 1}`,
          kind: 'DUPLICATION',
          level: 'attention',
          title: 'Médicament dupliqué dans cette ordonnance.',
          detail: `Les lignes ${previous + 1} et ${index + 1} ont la même DCI, le même dosage et la même forme.`,
          resolved: false,
        });
      } else {
        seen.set(duplicateKey, index);
      }

      if (allergies.includes(normalize(item.dci))) {
        alerts.push({
          id: `allergy-${index + 1}`,
          kind: 'ALLERGY',
          level: 'critical',
          title: 'Correspondance exacte avec une allergie structurée connue.',
          detail: item.dci,
          resolved: false,
        });
      }
      if (item.regulatoryCategory !== PrescriptionRegulatoryCategory.STANDARD) {
        alerts.push({
          id: `regulated-${index + 1}`,
          kind: 'REGULATED',
          level: 'attention',
          title:
            'Médicament soumis à une vigilance réglementaire supplémentaire.',
          detail: item.regulatoryCategory,
          resolved: false,
        });
      }
      if (item.durationDays !== null && item.durationDays <= 0) {
        alerts.push({
          id: `duration-${index + 1}`,
          kind: 'DURATION',
          level: 'critical',
          title: 'Durée de traitement invalide.',
          resolved: false,
        });
      }
      if (
        !item.quantity.trim() ||
        !item.dosePerIntake.trim() ||
        !item.frequency.trim()
      ) {
        alerts.push({
          id: `dosage-${index + 1}`,
          kind: 'DOSAGE',
          level: 'critical',
          title: 'Posologie, fréquence ou quantité manquante.',
          resolved: false,
        });
      }
    });

    if (!summary) {
      alerts.push({
        id: 'missing-medical-summary',
        kind: 'MISSING_CONTEXT',
        level: 'information',
        title: 'Résumé médical non renseigné.',
        detail:
          'Les allergies, traitements et antécédents ne peuvent pas être évalués.',
        resolved: false,
      });
    }

    return {
      alerts,
      evaluatedChecks: [
        'EXACT_DUPLICATE',
        'EXACT_STRUCTURED_ALLERGY_MATCH',
        'REGULATORY_CATEGORY',
        'REQUIRED_DOSING_FIELDS',
      ],
      notEvaluated: [
        'DRUG_INTERACTIONS',
        'COMPLEX_CONTRAINDICATIONS',
        'COMPLEX_DOSING',
        'PREGNANCY',
        'RENAL_FUNCTION',
        'HEPATIC_FUNCTION',
      ],
    };
  }

  private readSummary(value: unknown): MedicalSummary | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value
      : null;
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string')
      : [];
  }
}
