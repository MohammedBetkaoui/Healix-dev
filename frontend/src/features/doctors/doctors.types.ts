// Wire shape returned by GET /establishment/doctors. Mirrors
// backend/src/doctors/doctors.service.ts#listAffiliatedDoctors.
export type AffiliatedDoctor = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  speciality: string;
  wilaya: string;
  accountStatus: string;
};

// Mirrors backend/src/doctors/dto/create-affiliated-doctor.dto.ts exactly.
// No password: it is generated server-side.
export type CreateAffiliatedDoctorPayload = {
  fullName: string;
  speciality: string;
  wilaya: string;
  professionalAddress: string;
  email: string;
  phone: string;
};

// Wire shape returned by POST /establishment/doctors. Mirrors
// backend/src/doctors/doctors.service.ts#createAffiliatedDoctor —
// temporaryPassword is only ever present in this one response.
export type CreateAffiliatedDoctorResult = {
  doctorProfile: {
    id: string;
    fullName: string;
    email: string;
    phone: string;
    speciality: string;
    wilaya: string;
  };
  temporaryPassword: string;
};
