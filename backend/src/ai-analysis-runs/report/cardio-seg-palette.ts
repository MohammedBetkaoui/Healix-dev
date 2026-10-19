import { type CardioSegStructure } from '../ai-service.client';

// Colours of the cardiac MRI overlay, exactly as
// ai-service/app/cardio_seg_palette.json draws them (Okabe-Ito, legible on
// an MRI); the report's legend must match the image, which
// cardio-seg-report.spec.ts checks against that file. The background stays
// transparent.
export const CARDIO_SEG_PALETTE: Readonly<Record<CardioSegStructure, string>> =
  {
    LV: '#D55E00',
    RV: '#0072B2',
    MYO: '#009E73',
  };
