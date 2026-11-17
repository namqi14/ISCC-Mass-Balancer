/**
 * The Personal Data Protection Act 2010 (PDPA) notice shown to every user until
 * they accept it. DRAFT wording for the client's legal review before go-live.
 *
 * Keep NOTICE_VERSION in step with PDPA_VERSION in backend/src/lib/pdpa.ts:
 * changing the version there makes everyone accept the notice again.
 */
export const NOTICE_VERSION = "2026-11";

export interface NoticeSection {
  heading: string;
  /** Plain paragraphs, shown in order. */
  paragraphs?: string[];
  /** Bullet points shown after the paragraphs. */
  bullets?: string[];
}

export const NOTICE_TITLE = "Personal Data Protection Notice";

export const NOTICE_INTRO =
  "This notice is given under the Personal Data Protection Act 2010 of Malaysia (the PDPA). Please read all of it. You need to scroll to the end before you can continue.";

export const NOTICE_SECTIONS: NoticeSection[] = [
  {
    heading: "1. Who we are",
    paragraphs: [
      "ISCC Mass Balancer is a system that companies use to keep their ISCC mass balance records. It is operated by ALS Solutions (the platform operator) for the company that gave you your account (your company). In this notice, \"we\" means the platform operator and your company, who each handle your personal data for the purposes below.",
    ],
  },
  {
    heading: "2. The personal data we collect",
    bullets: [
      "Your name, work email address, role and the sites you are allowed to use.",
      "Your password, which is stored only in a scrambled form and can never be read back.",
      "A record of what you do in the system: when you log in, and the transactions, conversions, transfers, periods and other changes you make, with the date and time.",
      "Names and certificate numbers of the suppliers, customers and other business contacts you enter. These can include individuals.",
    ],
  },
  {
    heading: "3. Why we collect it",
    bullets: [
      "To create and manage your account and let you log in.",
      "To record mass balance transactions and show who made each entry.",
      "To meet ISCC certification, audit and legal record-keeping requirements.",
      "To keep the system secure, detect misuse and investigate problems.",
      "To send you system notices, such as when a balancing period is closed.",
    ],
  },
  {
    heading: "4. Who we may share it with",
    bullets: [
      "Administrators of your company, who can see the users and records of that company.",
      "ISCC certification bodies and auditors, when they need records to carry out an audit or certification.",
      "Service providers that help us run the system, such as cloud hosting and email delivery, who must keep it confidential.",
      "Government or regulatory authorities, when the law requires it.",
    ],
    paragraphs: ["We do not sell your personal data."],
  },
  {
    heading: "5. How we protect it, and where it is kept",
    paragraphs: [
      "Access is limited by role and by site. Passwords are stored in a scrambled form, and sensitive fields such as business contact names and certificate numbers are encrypted in the database. Your data is kept on cloud servers, which may be located outside Malaysia. We take reasonable steps to keep it secure wherever it is kept.",
    ],
  },
  {
    heading: "6. How long we keep it",
    paragraphs: [
      "We keep your personal data while your account is active and for as long as ISCC record-keeping and the law require afterwards, and then delete or anonymise it. Entries in the audit trail cannot be edited or removed one by one, because together they form the compliance record.",
    ],
  },
  {
    heading: "7. Your rights",
    paragraphs: [
      "You may ask to see the personal data we hold about you, ask us to correct it, and withdraw your consent. You can also ask us to limit how it is used. To do any of these, contact your company administrator or the platform operator, ALS Solutions. If you withdraw consent, you may no longer be able to use the system.",
    ],
  },
  {
    heading: "8. Your choice",
    paragraphs: [
      "You do not have to agree, but we need the personal data above to give you an account. If you do not agree, you will be logged out and will not be able to use the system.",
    ],
  },
  {
    heading: "9. Your consent",
    paragraphs: [
      "By clicking \"Understand, I Agree\", you confirm that you have read and understood this notice, and you consent to the processing of your personal data as described in it. We record the date and the version of the notice you accepted.",
    ],
  },
];
