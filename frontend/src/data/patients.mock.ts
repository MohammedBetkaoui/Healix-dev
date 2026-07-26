import {
  BrainCircuit,
  CalendarCheck,
  FileText,
  Pill,
  Stethoscope,
} from "lucide-react";

import { type Locale } from "@/i18n";
import {
  type Patient,
  type PatientBloodGroup,
  type PatientGender,
  type PatientStatus,
} from "@/types/patient";

const patientNames = [
  ["Amine", "Zeroual"],
  ["Nadia", "Mansouri"],
  ["Karim", "Belkacem"],
  ["Lina", "Boudiaf"],
  ["Yacine", "Ferhat"],
  ["Sofia", "Haddad"],
  ["Mehdi", "Ait Ali"],
  ["Sara", "Benkhelifa"],
  ["Riad", "Hamdi"],
  ["Meriem", "Dahmani"],
  ["Ilyes", "Saadi"],
  ["Nour", "Brahimi"],
  ["Walid", "Cherif"],
  ["Aya", "Kaced"],
  ["Samir", "Meziane"],
  ["Hadjer", "Taleb"],
  ["Fares", "Boucenna"],
  ["Yasmine", "Latreche"],
  ["Anis", "Khelifi"],
  ["Rania", "Guerfi"],
] as const;

const clinicalCopy = {
  fr: {
    allergies: ["Pénicilline", "Poussière"],
    chronicDiseases: ["Hypertension contrôlée"],
    consultations: {
      diagnosis: "État stable, surveillance recommandée",
      reason: "Suivi clinique programmé",
      treatment: "Traitement maintenu avec contrôle dans 30 jours",
    },
    history: ["Migraine chronique", "Antécédent familial cardiovasculaire"],
    medications: ["Amlodipine 5 mg", "Vitamine D"],
    notes:
      "Patient suivi régulièrement. Les constantes sont stables et les derniers bilans ne montrent pas d'alerte majeure.",
    timeline: {
      analysis: "Analyse IA réalisée",
      analysisDescription: "IRM cérébrale analysée avec un score de confiance élevé.",
      consultation: "Consultation de suivi",
      consultationDescription: "Évaluation clinique et adaptation du plan de suivi.",
      report: "Rapport médical généré",
      reportDescription: "Rapport PDF ajouté au dossier patient.",
      treatment: "Traitement ajusté",
      treatmentDescription: "Posologie mise à jour après contrôle.",
    },
  },
  ar: {
    allergies: ["البنسلين", "الغبار"],
    chronicDiseases: ["ارتفاع ضغط الدم تحت المراقبة"],
    consultations: {
      diagnosis: "الحالة مستقرة مع توصية بالمتابعة",
      reason: "متابعة سريرية مبرمجة",
      treatment: "تم الحفاظ على العلاج مع مراقبة بعد 30 يومًا",
    },
    history: ["صداع نصفي مزمن", "سوابق عائلية قلبية وعائية"],
    medications: ["Amlodipine 5 mg", "فيتامين D"],
    notes:
      "المريض تحت متابعة منتظمة. المؤشرات مستقرة ولا تظهر التحاليل الأخيرة أي إنذار مهم.",
    timeline: {
      analysis: "تم إجراء تحليل بالذكاء الاصطناعي",
      analysisDescription: "تم تحليل صورة الرنين المغناطيسي بدرجة ثقة مرتفعة.",
      consultation: "استشارة متابعة",
      consultationDescription: "تقييم سريري وتحديث خطة المتابعة.",
      report: "تم إنشاء تقرير طبي",
      reportDescription: "تمت إضافة تقرير PDF إلى ملف المريض.",
      treatment: "تم تعديل العلاج",
      treatmentDescription: "تم تحديث الجرعة بعد المراقبة.",
    },
  },
} as const;

const bloodGroups: PatientBloodGroup[] = [
  "A+",
  "O+",
  "B+",
  "AB+",
  "A-",
  "O-",
  "B-",
  "AB-",
];

const statuses: PatientStatus[] = ["ACTIVE", "FOLLOW_UP", "NEW", "URGENT"];

const doctors = [
  "Dr Mohamed Benali",
  "Dr Samir Benaissa",
  "Dr Rania Mansouri",
  "Dr Leila Achour",
  "Dr Adel Kerrouche",
];

function calculateBirthDate(index: number) {
  const year = 1964 + ((index * 7) % 42);
  const month = String((index % 12) + 1).padStart(2, "0");
  const day = String(((index * 3) % 27) + 1).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function createMockPatient(index: number, locale: Locale): Patient {
  const [firstName, lastName] = patientNames[index];
  const copy = clinicalCopy[locale];
  const gender: PatientGender = index % 2 === 0 ? "MALE" : "FEMALE";
  const patientNumber = 123 + index;
  const consultationDate = `2026-07-${String(24 - (index % 18)).padStart(2, "0")}`;

  return {
    address: `${12 + index}, Rue des Frères Bouadou, Alger`,
    aiAnalyses: [
      {
        date: consultationDate,
        id: `ai-${patientNumber}-1`,
        result: index % 4 === 0 ? "ANOMALY_DETECTED" : "NORMAL",
        score: 88 + (index % 10),
        type: index % 3 === 0 ? "MRI" : index % 3 === 1 ? "ECG" : "CT_SCAN",
      },
    ],
    assignedDoctor: doctors[index % doctors.length],
    birthDate: calculateBirthDate(index),
    bloodGroup: bloodGroups[index % bloodGroups.length],
    consultations: [
      {
        date: consultationDate,
        diagnosis: copy.consultations.diagnosis,
        doctor: doctors[index % doctors.length],
        id: `consultation-${patientNumber}-1`,
        reason: copy.consultations.reason,
        treatment: copy.consultations.treatment,
      },
    ],
    documents: [
      {
        date: consultationDate,
        fileName: `rapport-medical-${patientNumber}.pdf`,
        id: `document-${patientNumber}-1`,
        size: "840 KB",
        type: "MEDICAL_REPORT",
      },
      {
        date: "2026-06-18",
        fileName: `ordonnance-${patientNumber}.pdf`,
        id: `document-${patientNumber}-2`,
        size: "310 KB",
        type: "PRESCRIPTION",
      },
    ],
    email: `${firstName}.${lastName}@example.dz`.toLowerCase(),
    emergencyContactName: "Contact familial",
    emergencyContactPhone: `0555 8${String(patientNumber).padStart(3, "0")} 22`,
    firstName,
    gender,
    id: `HLX-${String(patientNumber).padStart(6, "0")}`,
    internalId: `patient_${patientNumber}`,
    lastName,
    lastVisit: consultationDate,
    medicalSummary: {
      allergies: copy.allergies,
      chronicDiseases: copy.chronicDiseases,
      currentMedications: copy.medications,
      history: copy.history,
      notes: copy.notes,
    },
    phone: `055${index % 10} ${String(120000 + index * 731).slice(0, 6)}`,
    registeredAt: `2026-${String((index % 6) + 1).padStart(2, "0")}-${String((index % 24) + 1).padStart(2, "0")}`,
    status: statuses[index % statuses.length],
    timeline: [
      {
        date: consultationDate,
        description: copy.timeline.consultationDescription,
        doctor: doctors[index % doctors.length],
        icon: Stethoscope,
        id: `timeline-${patientNumber}-consultation`,
        title: copy.timeline.consultation,
      },
      {
        date: "2026-07-20",
        description: copy.timeline.analysisDescription,
        icon: BrainCircuit,
        id: `timeline-${patientNumber}-analysis`,
        title: copy.timeline.analysis,
      },
      {
        date: "2026-07-18",
        description: copy.timeline.reportDescription,
        icon: FileText,
        id: `timeline-${patientNumber}-report`,
        title: copy.timeline.report,
      },
      {
        date: "2026-07-12",
        description: copy.timeline.treatmentDescription,
        icon: Pill,
        id: `timeline-${patientNumber}-treatment`,
        title: copy.timeline.treatment,
      },
      {
        date: "2026-06-28",
        description: copy.timeline.consultationDescription,
        icon: CalendarCheck,
        id: `timeline-${patientNumber}-planned`,
        title: copy.timeline.consultation,
      },
    ],
  };
}

export function getMockPatients(locale: Locale): Patient[] {
  return patientNames.map((_, index) => createMockPatient(index, locale));
}
