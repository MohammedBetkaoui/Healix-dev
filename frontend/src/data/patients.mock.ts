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
  type PatientAdministrativeStatus,
  type PatientBloodGroup,
  type PatientInsurance,
  type PatientSector,
  type PatientStatus,
} from "@/types/patient";

const patientNames = [
  ["Mohamed", "Ben Ali", "محمد", "بن علي"],
  ["Nadia", "Mansouri", "نادية", "منصوري"],
  ["Karim", "Belkacem", "كريم", "بلقاسم"],
  ["Lina", "Boudiaf", "لينا", "بوضياف"],
  ["Yacine", "Ferhat", "ياسين", "فرحات"],
  ["Sofia", "Haddad", "صوفيا", "حداد"],
  ["Mehdi", "Aït Ali", "مهدي", "آيت علي"],
  ["Sara", "Benkhelifa", "سارة", "بن خليفة"],
  ["Riad", "Hamdi", "رياض", "حمدي"],
  ["Meriem", "Dahmani", "مريم", "دحماني"],
  ["Ilyes", "Saadi", "إلياس", "سعدي"],
  ["Nour", "Brahimi", "نور", "براهيمي"],
  ["Walid", "Cherif", "وليد", "شريف"],
  ["Aya", "Kaced", "آية", "قاسد"],
  ["Samir", "Meziane", "سمير", "مزيان"],
  ["Hadjer", "Taleb", "هاجر", "طالب"],
  ["Fares", "Boucenna", "فارس", "بوسنة"],
  ["Yasmine", "Latreche", "ياسمين", "لطرش"],
  ["Anis", "Khelifi", "أنيس", "خليفي"],
  ["Rania", "Guerfi", "رانيا", "قرفي"],
] as const;

const locations = [
  ["16", "Alger", "Bab El Oued"],
  ["31", "Oran", "Bir El Djir"],
  ["25", "Constantine", "El Khroub"],
  ["09", "Blida", "Ouled Yaïch"],
  ["06", "Béjaïa", "Akbou"],
  ["19", "Sétif", "El Eulma"],
  ["23", "Annaba", "El Bouni"],
  ["15", "Tizi Ouzou", "Draâ Ben Khedda"],
] as const;

const doctors = [
  ["Dr Amel Benaïssa", "DZ-OM-16-04128"],
  ["Dr Samir Bouzid", "DZ-OM-31-02874"],
  ["Dr Leïla Achour", "DZ-OM-25-03691"],
  ["Dr Adel Kerrouche", "DZ-OM-09-05217"],
] as const;

const bloodGroups: PatientBloodGroup[] = [
  "A+", "O+", "B+", "AB+", "A-", "O-", "B-", "AB-",
];
const legacyStatuses: PatientStatus[] = ["ACTIVE", "FOLLOW_UP", "NEW", "ACTIVE"];
const administrativeStatuses: PatientAdministrativeStatus[] = [
  "ACTIVE", "ACTIVE", "INACTIVE", "ACTIVE", "ACTIVE", "DECEASED",
];
const insurances: PatientInsurance[] = ["CNAS", "CASNOS", "PRIVATE", "UNINSURED"];
const sectors: PatientSector[] = ["CONVENTIONED", "PRIVATE", "PUBLIC", "PRIVATE"];

function calculateBirthDate(index: number) {
  const year = 1961 + ((index * 7) % 47);
  const month = String((index % 12) + 1).padStart(2, "0");
  const day = String(((index * 3) % 27) + 1).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createMockPatient(index: number, locale: Locale): Patient {
  const [firstName, lastName, firstNameAr, lastNameAr] = patientNames[index];
  const [wilayaCode, wilaya, commune] = locations[index % locations.length];
  const [assignedDoctor, doctorRegistrationNumber] = doctors[index % doctors.length];
  const patientNumber = 123 + index;
  const recordNumber = String(patientNumber).padStart(6, "0");
  const visitDay = String(24 - (index % 18)).padStart(2, "0");
  const lastVisit = `2026-07-${visitDay}`;
  const nextVisit = index % 3 === 0 ? "" : `2026-09-${String(4 + index).padStart(2, "0")}`;
  const insurance = insurances[index % insurances.length];
  const isFrench = locale === "fr";

  return {
    administrativeStatus: administrativeStatuses[index % administrativeStatuses.length],
    address: `${12 + index}, rue des Frères Bouadou`,
    aiAnalyses: [{
      date: lastVisit,
      id: `ai-${patientNumber}-1`,
      result: index % 4 === 0 ? "ANOMALY_DETECTED" : "NORMAL",
      score: 88 + (index % 10),
      type: index % 3 === 0 ? "MRI" : index % 3 === 1 ? "ECG" : "CT_SCAN",
    }],
    assignedDoctor,
    audit: [{
      action: isFrench ? "Création du registre patient" : "إنشاء سجل المريض",
      actor: "Nadia Khelifi · Administration",
      at: `2026-0${(index % 6) + 1}-${String((index % 24) + 1).padStart(2, "0")}T09:24:00+01:00`,
      id: `audit-${patientNumber}-1`,
      organization: "Clinique El Shifa",
    }],
    birthDate: calculateBirthDate(index),
    bloodGroup: bloodGroups[index % bloodGroups.length],
    commune,
    consents: [
      {
        documentName: `consentement-18-07-${recordNumber}.pdf`,
        recordedAt: `2026-0${(index % 6) + 1}-${String((index % 24) + 1).padStart(2, "0")}T09:26:00+01:00`,
        recordedBy: "Nadia Khelifi · Administration",
        status: "SIGNED",
        type: "HEALTH_DATA",
      },
      { recordedAt: "", recordedBy: "", status: "NOT_GRANTED", type: "DIAGNOSTIC_AI" },
      { recordedAt: "", recordedBy: "", status: "NOT_GRANTED", type: "RESEARCH" },
    ],
    consultations: [{
      date: lastVisit,
      diagnosis: isFrench ? "Diagnostic validé par le praticien" : "تشخيص مصادق عليه من الطبيب",
      doctor: assignedDoctor,
      id: `consultation-${patientNumber}-1`,
      reason: isFrench ? "Consultation de suivi" : "استشارة متابعة",
      treatment: isFrench ? "Plan thérapeutique documenté" : "خطة علاج موثقة",
    }],
    doctorRegistrationNumber,
    documents: [{
      date: lastVisit,
      fileName: `rapport-medical-${recordNumber}.pdf`,
      id: `document-${patientNumber}-1`,
      size: "840 KB",
      type: "MEDICAL_REPORT",
    }],
    email: `${firstName}.${lastName.replaceAll(" ", "")}@example.dz`.toLowerCase(),
    emergencyContactName: "Contact familial",
    emergencyContactPhone: `055${index % 10}${String(810000 + index * 731).slice(0, 6)}`,
    firstName,
    firstNameAr,
    gender: index % 2 === 0 ? "MALE" : "FEMALE",
    hospitalRecordNumber: `DH-${wilayaCode}-${recordNumber}`,
    id: `PAT-2026-${recordNumber}`,
    insurance,
    insuredNumber: insurance === "CNAS" || insurance === "CASNOS" ? `AS-${String(200000000000 + index * 7919)}` : "",
    internalId: `patient_${patientNumber}`,
    lastName,
    lastNameAr,
    lastVisit,
    medicalSummary: {
      allergies: index % 4 === 0 ? [isFrench ? "Pénicilline" : "البنسلين"] : [],
      chronicDiseases: [],
      currentMedications: [],
      history: [],
      notes: "",
    },
    nationalId: index % 5 === 3 ? "" : `${190000000000000000 + index * 113791}`,
    nextVisit,
    phone: `0${index % 2 === 0 ? "55" : "66"}${String(1200000 + index * 731).slice(0, 7)}`,
    registeredAt: `2026-0${(index % 6) + 1}-${String((index % 24) + 1).padStart(2, "0")}`,
    sector: sectors[index % sectors.length],
    smsEnabled: index % 4 !== 2,
    status: legacyStatuses[index % legacyStatuses.length],
    timeline: [
      {
        date: lastVisit,
        description: isFrench ? "Consultation documentée dans le dossier clinique." : "تم توثيق الاستشارة في الملف السريري.",
        doctor: assignedDoctor,
        icon: Stethoscope,
        id: `timeline-${patientNumber}-consultation`,
        title: isFrench ? "Consultation de suivi" : "استشارة متابعة",
      },
      {
        date: "2026-07-20",
        description: isFrench ? "Résultat IA conservé séparément du diagnostic médical." : "تم حفظ نتيجة الذكاء الاصطناعي بشكل منفصل عن التشخيص الطبي.",
        icon: BrainCircuit,
        id: `timeline-${patientNumber}-analysis`,
        title: isFrench ? "Aide à la décision IA" : "مساعدة القرار بالذكاء الاصطناعي",
      },
      {
        date: "2026-07-18",
        description: isFrench ? "Document ajouté au dossier patient." : "تمت إضافة وثيقة إلى ملف المريض.",
        icon: FileText,
        id: `timeline-${patientNumber}-document`,
        title: isFrench ? "Document médical" : "وثيقة طبية",
      },
      {
        date: "2026-07-12",
        description: isFrench ? "Traitement validé par le praticien." : "تمت المصادقة على العلاج من طرف الطبيب.",
        icon: Pill,
        id: `timeline-${patientNumber}-treatment`,
        title: isFrench ? "Traitement" : "علاج",
      },
      {
        date: nextVisit || lastVisit,
        description: isFrench ? "Rappel SMS configuré selon le consentement." : "تم إعداد تذكير الرسائل القصيرة حسب الموافقة.",
        icon: CalendarCheck,
        id: `timeline-${patientNumber}-appointment`,
        title: isFrench ? "Rendez-vous" : "موعد",
      },
    ],
    wilaya,
    wilayaCode,
  };
}

export function getMockPatients(locale: Locale): Patient[] {
  return patientNames.map((_, index) => createMockPatient(index, locale));
}

export function getMockPatientById(patientId: string, locale: Locale): Patient | undefined {
  return getMockPatients(locale).find(
    (patient) => patient.id === patientId || patient.internalId === patientId,
  );
}
