import { AiReportRenderer } from '../ai-analysis-runs/report/ai-report-renderer';
import { PrescriptionPdfService } from './prescription-pdf.service';

describe('PrescriptionPdfService (Chromium)', () => {
  it('renders an A4 PDF from frozen snapshots without external resources', async () => {
    const renderer = new AiReportRenderer();
    try {
      const pdf = await new PrescriptionPdfService(renderer).render({
        number: 'ORD-2026-000001',
        prescribedAt: new Date('2026-10-21T10:00:00Z'),
        patient: {
          firstName: 'Yasmine',
          lastName: 'Benali',
          birthDate: '1992-04-12',
          hospitalRecordNumber: 'DOS-001',
        },
        prescriber: {
          fullName: 'Amine Rahmani',
          speciality: 'Médecine interne',
          registrationNumber: 'ORD-ALG-001',
          regionalCouncil: "Conseil régional d'Alger",
          professionalAddress: 'Alger',
        },
        organization: {
          name: 'Cabinet de démonstration',
          address: 'Alger',
          wilaya: 'Alger',
          phone: '+213000000000',
        },
        items: [
          {
            dci: 'Paracétamol',
            brandName: null,
            strength: '500 mg',
            pharmaceuticalForm: 'TABLET',
            route: 'ORAL',
            dosePerIntake: '1 comprimé',
            frequency: '2 fois par jour',
            intakeMoment: null,
            durationDays: 3,
            quantity: '6 comprimés',
            patientInstructions: null,
          },
        ],
        contentFingerprint: 'a'.repeat(64),
      });
      expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      expect(pdf.length).toBeGreaterThan(5_000);
    } finally {
      await renderer.onModuleDestroy();
    }
  }, 30_000);
});
