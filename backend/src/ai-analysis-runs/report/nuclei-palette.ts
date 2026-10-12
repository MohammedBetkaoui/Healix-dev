import { type NucleusType } from '../ai-service.client';

// Colours of the nuclei overlay, exactly as ai-service/app/nuclei_palette.json
// draws them (Okabe-Ito, legible on H&E); the report's legend must match the
// image, which pathology-report.spec.ts checks against that file. The
// background stays transparent.
export const NUCLEI_PALETTE: Readonly<Record<NucleusType, string>> = {
  neoplastic: '#D55E00',
  inflammatory: '#0072B2',
  connective: '#009E73',
  dead: '#6E6E6E',
  epithelial: '#F0E442',
};
