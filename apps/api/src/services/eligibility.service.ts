import type { Gender, HouseType, SchemeStatus } from '@prisma/client';

export type EligibilityCriteria = {
  tribalCommunities?: string[];
  communities?: string[];
  minAnnualIncome?: number;
  maxAnnualIncome?: number;
  occupations?: string[];
  requireStudent?: boolean;
  requireDisability?: boolean;
  requireWidow?: boolean;
  requireSeniorCitizen?: boolean;
  requireFarmer?: boolean;
  minAge?: number;
  maxAge?: number;
  minLandOwnershipAcres?: number;
  maxLandOwnershipAcres?: number;
  allowedHouseTypes?: HouseType[];
  gender?: Gender;
  requiresBankAccount?: boolean;
};

export type EligibilityFamily = {
  id: string;
  tribalCommunity: string;
  isWidow: boolean;
  income: {
    annualIncome: number | { toNumber(): number };
    primaryOccupation: string | null;
    landOwnershipAcres: number | { toNumber(): number } | null;
    houseType: HouseType | null;
    hasBankAccount: boolean;
  } | null;
  members: Array<{
    name: string;
    gender: Gender;
    dateOfBirth: Date | null;
    age: number | null;
    occupation: string | null;
    hasDisability: boolean;
    isStudent: boolean;
  }>;
};

export type EligibilityScheme = {
  id: string;
  code: string;
  name: string;
  criteria: unknown;
  lastDate: Date | null;
  status?: SchemeStatus;
};

export type EligibilityCondition = { key: string; passed: boolean; message: string };
export type EligibilityResult = {
  schemeId: string;
  schemeCode: string;
  schemeName: string;
  eligible: boolean;
  reasons: string[];
  conditions: EligibilityCondition[];
  evaluatedAt: string;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const numberValue = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const booleanValue = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined);

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const decimalToNumber = (value: number | { toNumber(): number } | null | undefined) => {
  if (value == null) return undefined;
  return typeof value === 'number' ? value : value.toNumber();
};

const yearsOld = (dateOfBirth: Date | null, suppliedAge: number | null, now = new Date()) => {
  if (suppliedAge != null) return suppliedAge;
  if (!dateOfBirth) return undefined;
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dateOfBirth.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dateOfBirth.getUTCDate())) age -= 1;
  return age;
};

const criterion = (conditions: EligibilityCondition[], key: string, passed: boolean, message: string) => {
  conditions.push({ key, passed, message });
};

export const evaluateSchemeEligibility = (family: EligibilityFamily, scheme: EligibilityScheme): EligibilityResult => {
  const raw = asRecord(scheme.criteria);
  const criteria: EligibilityCriteria = {
    tribalCommunities: strings(raw.tribalCommunities),
    communities: strings(raw.communities),
    minAnnualIncome: numberValue(raw.minAnnualIncome),
    maxAnnualIncome: numberValue(raw.maxAnnualIncome),
    occupations: strings(raw.occupations),
    requireStudent: booleanValue(raw.requireStudent),
    requireDisability: booleanValue(raw.requireDisability ?? raw.requiresDisability),
    requireWidow: booleanValue(raw.requireWidow),
    requireSeniorCitizen: booleanValue(raw.requireSeniorCitizen),
    requireFarmer: booleanValue(raw.requireFarmer),
    minAge: numberValue(raw.minAge),
    maxAge: numberValue(raw.maxAge),
    minLandOwnershipAcres: numberValue(raw.minLandOwnershipAcres),
    maxLandOwnershipAcres: numberValue(raw.maxLandOwnershipAcres),
    allowedHouseTypes: strings(raw.allowedHouseTypes) as HouseType[],
    gender: typeof raw.gender === 'string' ? (raw.gender as Gender) : undefined,
    requiresBankAccount: booleanValue(raw.requiresBankAccount),
  };
  const conditions: EligibilityCondition[] = [];
  const income = decimalToNumber(family.income?.annualIncome);
  const land = decimalToNumber(family.income?.landOwnershipAcres);
  const memberAges = family.members.map((member) => ({ member, age: yearsOld(member.dateOfBirth, member.age) }));

  if (scheme.lastDate) {
    criterion(conditions, 'lastDate', scheme.lastDate >= new Date(), `Applications closed on ${scheme.lastDate.toLocaleDateString('en-IN')}.`);
  }
  const allowedCommunities = [...(criteria.tribalCommunities ?? []), ...(criteria.communities ?? [])];
  if (allowedCommunities.length) {
    const passed = allowedCommunities.some((community) => community.toLowerCase() === family.tribalCommunity.toLowerCase());
    criterion(conditions, 'tribalCommunity', passed, passed ? 'Tribal community matches.' : `Available only to: ${allowedCommunities.join(', ')}.`);
  }
  if (criteria.maxAnnualIncome != null) {
    const passed = income != null && income <= criteria.maxAnnualIncome;
    criterion(conditions, 'maxAnnualIncome', passed, passed ? 'Income is within the scheme limit.' : `Annual income must not exceed ₹${criteria.maxAnnualIncome.toLocaleString('en-IN')}.`);
  }
  if (criteria.minAnnualIncome != null) {
    const passed = income != null && income >= criteria.minAnnualIncome;
    criterion(conditions, 'minAnnualIncome', passed, passed ? 'Income meets the scheme minimum.' : `Annual income must be at least ₹${criteria.minAnnualIncome.toLocaleString('en-IN')}.`);
  }
  if (criteria.requireStudent) {
    const passed = family.members.some((member) => member.isStudent);
    criterion(conditions, 'student', passed, passed ? 'A student is recorded in the household.' : 'No student is recorded in this household.');
  }
  if (criteria.requireDisability) {
    const passed = family.members.some((member) => member.hasDisability);
    criterion(conditions, 'disability', passed, passed ? 'A household member has a recorded disability.' : 'This benefit requires a recorded disability.');
  }
  if (criteria.requireWidow) {
    criterion(conditions, 'widow', family.isWidow, family.isWidow ? 'Widow status is recorded.' : 'This benefit is for widow-headed households.');
  }
  if (criteria.requireSeniorCitizen) {
    const passed = memberAges.some(({ age }) => age != null && age >= 60);
    criterion(conditions, 'seniorCitizen', passed, passed ? 'A senior citizen is recorded in the household.' : 'No household member aged 60 or above is recorded.');
  }
  if (criteria.requireFarmer) {
    const occupation = `${family.income?.primaryOccupation ?? ''} ${family.members.map((member) => member.occupation ?? '').join(' ')}`.toLowerCase();
    const passed = /farmer|farming|agricultur/.test(occupation);
    criterion(conditions, 'farmer', passed, passed ? 'Farming occupation is recorded.' : 'This benefit requires a farming occupation.');
  }
  if (criteria.occupations?.length) {
    const occupations = `${family.income?.primaryOccupation ?? ''} ${family.members.map((member) => member.occupation ?? '').join(' ')}`.toLowerCase();
    const passed = criteria.occupations.some((occupation) => occupations.includes(occupation.toLowerCase()));
    criterion(conditions, 'occupation', passed, passed ? 'Household occupation matches.' : `Requires one of: ${criteria.occupations.join(', ')}.`);
  }
  if (criteria.minAge != null || criteria.maxAge != null) {
    const passed = memberAges.some(({ age }) => age != null && (criteria.minAge == null || age >= criteria.minAge) && (criteria.maxAge == null || age <= criteria.maxAge));
    const label = criteria.minAge != null && criteria.maxAge != null ? `${criteria.minAge}–${criteria.maxAge}` : criteria.minAge != null ? `${criteria.minAge}+` : `up to ${criteria.maxAge}`;
    criterion(conditions, 'age', passed, passed ? 'At least one household member meets the age criterion.' : `No household member is in the required age range (${label}).`);
  }
  if (criteria.gender) {
    const passed = family.members.some((member) => member.gender === criteria.gender);
    criterion(conditions, 'gender', passed, passed ? 'A qualifying household member is recorded.' : `Requires a ${criteria.gender.toLowerCase()} household member.`);
  }
  if (criteria.minLandOwnershipAcres != null) {
    const passed = land != null && land >= criteria.minLandOwnershipAcres;
    criterion(conditions, 'minLandOwnershipAcres', passed, passed ? 'Landholding meets the minimum.' : `Requires at least ${criteria.minLandOwnershipAcres} acres of land.`);
  }
  if (criteria.maxLandOwnershipAcres != null) {
    const passed = land != null && land <= criteria.maxLandOwnershipAcres;
    criterion(conditions, 'maxLandOwnershipAcres', passed, passed ? 'Landholding is within the maximum.' : `Landholding must not exceed ${criteria.maxLandOwnershipAcres} acres.`);
  }
  if (criteria.allowedHouseTypes?.length) {
    const passed = family.income?.houseType != null && criteria.allowedHouseTypes.includes(family.income.houseType);
    criterion(conditions, 'houseType', passed, passed ? 'House type matches the scheme.' : `Available for: ${criteria.allowedHouseTypes.join(', ')}.`);
  }
  if (criteria.requiresBankAccount) {
    const passed = family.income?.hasBankAccount === true;
    criterion(conditions, 'bankAccount', passed, passed ? 'A bank account is recorded.' : 'A verified bank account is required.');
  }

  const reasons = conditions.filter((condition) => !condition.passed).map((condition) => condition.message);
  return {
    schemeId: scheme.id,
    schemeCode: scheme.code,
    schemeName: scheme.name,
    eligible: reasons.length === 0,
    reasons,
    conditions,
    evaluatedAt: new Date().toISOString(),
  };
};
