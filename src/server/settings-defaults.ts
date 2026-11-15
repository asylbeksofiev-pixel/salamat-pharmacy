// Defaults shared by the app and the seed script (no server-only import here).
import { DEFAULT_OFFER_POLICY, type OfferPolicy } from "../lib/offer";

export interface HelplineSetting {
  phone: string; // E.164
  verified: boolean;
  hoursRu?: string;
  hoursKk?: string;
}
export interface CompanySetting {
  legalName: string;
  bin: string;
  foundedYear: number;
  legalAddress: string;
  email?: string;
  licenseInfo?: string;
  verified: boolean;
}
export interface CheckoutSetting {
  deliveryEnabled: boolean;
  deliveryTermsRu: string;
  deliveryTermsKk: string;
  maxLines: number;
  maxQtyPerLine: number;
  consentVersion: string;
}
export interface RetentionSetting {
  orderPiiDays: number;
}

export interface Settings {
  helpline: HelplineSetting;
  company: CompanySetting;
  offerPolicy: OfferPolicy;
  checkout: CheckoutSetting;
  retention: RetentionSetting;
}

/** Defaults are the values found on salamatfarmacia.kz (14.11.2026); all marked unverified. */
export const DEFAULT_SETTINGS: Settings = {
  helpline: { phone: "+77016727627", verified: false },
  company: {
    legalName: "ТОО «SALAMAT FARMACIA»",
    bin: "160340015018",
    foundedYear: 2016,
    legalAddress: "г. Астана, район Сарайшык, ул. Р. Кошкарбаева, д. 56, н.п. 3",
    verified: false,
  },
  offerPolicy: DEFAULT_OFFER_POLICY,
  checkout: {
    deliveryEnabled: false,
    deliveryTermsRu: "",
    deliveryTermsKk: "",
    maxLines: 30,
    maxQtyPerLine: 10,
    consentVersion: "privacy-draft-2026-11-14",
  },
  retention: { orderPiiDays: 180 },
};

