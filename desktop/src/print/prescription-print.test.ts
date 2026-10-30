import { describe, expect, it } from "vitest";
import { escapeHtml, renderPrescriptionHtml, type PrescriptionPrintInput } from "./prescription-print";

const input = (overrides: Partial<PrescriptionPrintInput> = {}): PrescriptionPrintInput => ({
  number: "ORD-2026-000184",
  date: "2026-10-29T10:00:00.000Z",
  contentFingerprint: "f".repeat(64),
  patient: { firstName: "Amine", lastName: "Benali", birthDate: "1988-04-12T00:00:00.000Z", hospitalRecordNumber: "HD-2026-00412" },
  prescriber: {
    fullName: "Dr Démonstration", speciality: "Médecine générale", registrationNumber: "34/1234",
    regionalCouncil: "Conseil régional de Sétif", professionalAddress: "12 rue des Frères Bouadou",
  },
  organization: { name: "Cabinet du Dr Démonstration", address: "12 rue des Frères Bouadou", wilaya: "Bordj Bou Arréridj", phone: "0550 12 34 56" },
  items: [
    {
      dci: "Amlodipine", brandName: "Amlor", strength: "5 mg", pharmaceuticalForm: "TABLET", route: "ORAL",
      dosePerIntake: "1 comprimé", frequency: "1 fois par jour", intakeMoment: "le matin", durationDays: 30,
      quantity: "1 boîte", patientInstructions: "À prendre pendant les repas",
    },
    { dci: "Aspirine", strength: "100 mg", pharmaceuticalForm: "CAPSULE", route: "ORAL", dosePerIntake: "1", frequency: "1 fois par jour", durationDays: null, quantity: "1 boîte" },
  ],
  ...overrides,
});

describe("the printed prescription has the blocks of the server's document", () => {
  const html = renderPrescriptionHtml(input());

  it("is an A4 page with the HealixDz header and the cabinet", () => {
    expect(html).toContain("size: A4 portrait");
    expect(html).toContain("HEALIXDZ");
    expect(html).toContain("<b>Cabinet du Dr Démonstration</b>");
    expect(html).toContain("12 rue des Frères Bouadou<br>Bordj Bou Arréridj<br>0550 12 34 56");
    expect(html).toContain("<h1>ORDONNANCE</h1>");
  });

  it("has the Patient, Prescripteur and Médicaments blocks", () => {
    expect(html).toContain("<h2>Patient</h2>");
    expect(html).toContain("<b>Nom :</b> Benali");
    expect(html).toContain("<b>Prénom :</b> Amine");
    expect(html).toContain("<b>Date de naissance :</b> 12/04/1988");
    expect(html).toContain("<b>N° dossier :</b> HD-2026-00412");
    expect(html).toContain("<h2>Prescripteur</h2>");
    expect(html).toContain("<b>Dr :</b> Dr Démonstration");
    expect(html).toContain("<b>Spécialité :</b> Médecine générale");
    expect(html).toContain("<b>N° d’Ordre :</b> 34/1234");
    expect(html).toContain("<b>Conseil régional :</b> Conseil régional de Sétif");
    expect(html).toContain("<b>Adresse professionnelle :</b> 12 rue des Frères Bouadou");
    expect(html).toContain("<h2>Médicaments</h2>");
  });

  it("writes each medication: DCI and brand, strength, form and route in French, dosing, duration, quantity, instructions", () => {
    expect(html).toContain("1. Amlodipine — Amlor");
    expect(html).toContain("5 mg · Comprimé · Orale");
    expect(html).toContain("<b>Posologie :</b> 1 comprimé — 1 fois par jour — le matin");
    expect(html).toContain("<b>Durée :</b> 30 jour(s) · <b>Quantité :</b> 1 boîte");
    expect(html).toContain("<b>Instructions :</b> À prendre pendant les repas");
    expect(html).toContain("2. Aspirine");
    expect(html).toContain("100 mg · Gélule · Orale");
    expect(html).toContain("<b>Durée :</b> Non précisée");
    expect(html).not.toMatch(/TABLET|CAPSULE|>ORAL</);
  });

  it("ends with the place and date, the stamp and signature frame, and the footer", () => {
    expect(html).toContain("Fait à Bordj Bou Arréridj, le 29 octobre 2026.");
    expect(html).toContain('<div class="signature">Cachet / signature manuscrite</div>');
    expect(html).toContain("Copie imprimée hors ligne depuis HealixDz Desktop");
  });
});

describe("a validated prescription", () => {
  const html = renderPrescriptionHtml(input());

  it("carries its official number and its date", () => {
    expect(html).toContain("<b>N° ORD-2026-000184</b> · 29 octobre 2026");
    expect(html).not.toContain("Établie hors ligne");
    expect(html).not.toContain("<title>Ordonnance (brouillon)</title>");
  });

  it("carries the fingerprint of its content", () => {
    expect(html).toContain(`Empreinte du contenu : ${"f".repeat(64)}`);
  });
});

describe("a draft printed offline", () => {
  const html = renderPrescriptionHtml(input({ number: null, contentFingerprint: null, date: "2026-10-30T08:42:00.000Z" }));

  it("says it was established offline, with no number, until the synchronization", () => {
    expect(html).toContain("<b>Établie hors ligne le 30 octobre 2026</b> — numéro attribué lors de la synchronisation");
    expect(html).not.toContain("N° ORD-");
    expect(html).toContain("<title>Ordonnance (brouillon)</title>");
    expect(html).toContain("Brouillon établi hors ligne depuis HealixDz Desktop");
  });

  it("has no fingerprint, even if one was given", () => {
    expect(html).not.toContain("Empreinte du contenu");
    expect(renderPrescriptionHtml(input({ number: null, contentFingerprint: "e".repeat(64) }))).not.toContain("Empreinte du contenu");
  });
});

describe("escaping", () => {
  it("prints a trapped name as text", () => {
    const html = renderPrescriptionHtml(
      input({
        patient: { firstName: "<script>alert(1)</script>", lastName: 'O"Brien & <b>fils</b>', hospitalRecordNumber: "<img src=x onerror=alert(2)>" },
        prescriber: { fullName: "<script>x</script>", speciality: "'; DROP TABLE" },
        organization: { name: "<svg onload=alert(3)>", address: "a<br>b", wilaya: "</div>", phone: "&" },
        items: [{ dci: "<script>d</script>", brandName: "<i>b</i>", strength: "<5>", pharmaceuticalForm: "<form>", route: "<route>", dosePerIntake: "<d>", frequency: "<f>", quantity: "<q>", patientInstructions: "<script>i</script>" }],
        number: "<ORD>",
        contentFingerprint: "<fp>",
      }),
    );
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<svg onload");
    expect(html).not.toContain("<b>fils</b>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("O&quot;Brien &amp; &lt;b&gt;fils&lt;/b&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(2)&gt;");
    expect(html).toContain("&lt;ORD&gt;");
    expect(html).toContain("&lt;fp&gt;");
    // Only the markup of the template itself remains.
    expect((html.match(/<script/gi) ?? []).length).toBe(0);
  });

  it("escapes the five characters, and prints nothing for a missing value", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#039;");
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml(0)).toBe("0");
  });
});
