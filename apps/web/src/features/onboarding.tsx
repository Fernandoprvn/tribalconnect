import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  Add,
  ArrowBack,
  ArrowForward,
  CheckCircleOutline,
  DeleteOutline,
  DescriptionOutlined,
  SaveOutlined,
  UploadFileOutlined,
} from '@mui/icons-material';
import { yupResolver } from '@hookform/resolvers/yup';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  useFieldArray,
  useForm,
  useWatch,
  type FieldPath,
  type Resolver,
} from 'react-hook-form';
import * as yup from 'yup';

/**
 * The values collected while registering a family.  The API layer can map this
 * shape directly to its own request DTO, keeping this feature independent of a
 * particular data fetching library.
 */
export interface FamilyOnboardingValues {
  familyDetails: {
    familyHeadName: string;
    fatherOrHusbandName: string;
    mobileNumber: string;
    aadhaarNumber: string;
    tribalCommunity: string;
    casteCertificateNumber: string;
    address: string;
    village: string;
    panchayat: string;
    district: string;
    state: string;
  };
  members: FamilyMember[];
  income: IncomeDetails;
  /** File metadata only. The caller should upload the original file separately. */
  documents: FamilyDocumentRecord[];
}

export interface FamilyMember {
  name: string;
  gender: 'Female' | 'Male' | 'Other' | 'Prefer not to say';
  age: number;
  dob: string;
  relationship: string;
  occupation: string;
  education: string;
  disability: string;
  aadhaarNumber: string;
}

export interface IncomeDetails {
  annualIncome: number;
  occupation: string;
  landOwnership: string;
  houseType: string;
  livestock: string;
  bankAccount: string;
  ifsc: string;
  rationCardNumber: string;
}

export const FAMILY_DOCUMENTS = [
  { key: 'aadhaar', label: 'Aadhaar card', required: true },
  { key: 'communityCertificate', label: 'Community certificate', required: true },
  { key: 'incomeCertificate', label: 'Income certificate', required: true },
  { key: 'rationCard', label: 'Ration card', required: false },
  { key: 'bankPassbook', label: 'Bank passbook', required: false },
  { key: 'passportPhoto', label: 'Passport photo', required: false },
  { key: 'housePhoto', label: 'House photo', required: false },
  { key: 'landDocuments', label: 'Land documents', required: false },
] as const;

export type OnboardingDocumentKey = (typeof FAMILY_DOCUMENTS)[number]['key'];
export type FamilyOnboardingFiles = Partial<Record<OnboardingDocumentKey, File>>;

export interface FamilyDocumentRecord {
  key: OnboardingDocumentKey;
  label: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

type UploadState = 'uploading' | 'ready' | 'draft';

interface DocumentUiItem extends FamilyDocumentRecord {
  progress: number;
  state: UploadState;
  /** Retained only in memory and never written to an offline draft. */
  file?: File;
  previewUrl?: string;
}

export interface FamilyOnboardingPageProps {
  /** Values supplied by an existing family record when correcting or continuing an application. */
  initialValues?: Partial<FamilyOnboardingValues>;
  villages?: string[];
  districts?: string[];
  tribalCommunities?: string[];
  states?: string[];
  /** Called only after all form and required-document checks pass. */
  onSubmit?: (values: FamilyOnboardingValues, files: FamilyOnboardingFiles) => Promise<void> | void;
  /** Gives a parent a chance to react to a locally saved draft. */
  onDraftSaved?: (values: FamilyOnboardingValues) => void;
  offlineDraftKey?: string;
  enableOfflineDraft?: boolean;
  requiredDocuments?: OnboardingDocumentKey[];
  submitLabel?: string;
  /** Lets a route fetch villages only after a district has been selected. */
  onDistrictChange?: (district: string) => void;
  /** Existing records keep their protected Aadhaar value when this field is left blank. */
  allowExistingAadhaar?: boolean;
}

const DEFAULT_DRAFT_KEY = 'tribalconnect:family-onboarding:draft';
const DRAFT_VERSION = 1;
// Keep browser validation aligned with the API's default MAX_UPLOAD_BYTES value.
const MAX_DOCUMENT_SIZE = 5 * 1024 * 1024;
const ACCEPTED_DOCUMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const requiredText = (label: string) => yup.string().trim().required(`${label} is required`);
const optionalAadhaar = yup
  .string()
  .trim()
  .test('aadhaar-format', 'Enter a valid 12-digit Aadhaar number', (value) => !value || /^\d{12}$/.test(value));
const optionalBankAccount = yup
  .string()
  .trim()
  .test('bank-account-format', 'Enter a valid bank account number', (value) => !value || /^\d{9,18}$/.test(value));
const optionalIfsc = yup
  .string()
  .trim()
  .uppercase()
  .test('ifsc-format', 'Enter a valid IFSC code', (value) => !value || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(value));

const familyOnboardingSchema = yup.object({
  familyDetails: yup.object({
    familyHeadName: requiredText('Family head name'),
    fatherOrHusbandName: requiredText('Father / husband name'),
    mobileNumber: yup
      .string()
      .trim()
      .matches(/^\d{10}$/, 'Enter a valid 10-digit mobile number')
      .required('Mobile number is required'),
    aadhaarNumber: optionalAadhaar.when('$allowExistingAadhaar', {
      is: true,
      then: (rule) => rule.notRequired(),
      otherwise: (rule) => rule.required('Aadhaar number is required'),
    }),
    tribalCommunity: requiredText('Tribal community'),
    casteCertificateNumber: requiredText('Caste certificate number'),
    address: requiredText('Address'),
    village: requiredText('Village'),
    panchayat: requiredText('Panchayat'),
    district: requiredText('District'),
    state: requiredText('State'),
  }),
  members: yup
    .array()
    .of(
      yup.object({
        name: requiredText('Member name'),
        gender: yup
          .mixed<FamilyMember['gender']>()
          .oneOf(['Female', 'Male', 'Other', 'Prefer not to say'])
          .required('Gender is required'),
        age: yup
          .number()
          .transform((value, originalValue) => (originalValue === '' ? undefined : value))
          .typeError('Enter an age')
          .integer('Age must be a whole number')
          .min(0, 'Age cannot be negative')
          .max(120, 'Enter a valid age')
          .required('Age is required'),
        dob: requiredText('Date of birth'),
        relationship: requiredText('Relationship'),
        occupation: requiredText('Occupation'),
        education: requiredText('Education'),
        disability: requiredText('Disability status'),
        aadhaarNumber: optionalAadhaar,
      }),
    )
    .min(1, 'Add at least one family member')
    .required(),
  income: yup.object({
    annualIncome: yup
      .number()
      .transform((value, originalValue) => (originalValue === '' ? undefined : value))
      .typeError('Enter annual income')
      .min(0, 'Income cannot be negative')
      .required('Annual income is required'),
    occupation: requiredText('Primary occupation'),
    landOwnership: requiredText('Land ownership'),
    houseType: requiredText('House type'),
    livestock: requiredText('Livestock details'),
    bankAccount: optionalBankAccount.when('$allowExistingAadhaar', {
      is: true,
      then: (rule) => rule.notRequired(),
      otherwise: (rule) => rule.required('Bank account number is required'),
    }),
    ifsc: optionalIfsc.when('$allowExistingAadhaar', {
      is: true,
      then: (rule) => rule.notRequired(),
      otherwise: (rule) => rule.required('IFSC code is required'),
    }),
    rationCardNumber: requiredText('Ration card number'),
  }),
  documents: yup.array().of(
    yup.object({
      key: yup.mixed<OnboardingDocumentKey>().oneOf(FAMILY_DOCUMENTS.map((document) => document.key)).required(),
      label: yup.string().required(),
      fileName: yup.string().required(),
      mimeType: yup.string().required(),
      size: yup.number().required(),
      uploadedAt: yup.string().required(),
    }),
  ),
});

const emptyMember = (): FamilyMember => ({
  name: '',
  gender: 'Prefer not to say',
  age: 0,
  dob: '',
  relationship: '',
  occupation: '',
  education: '',
  disability: 'No disability declared',
  aadhaarNumber: '',
});

/** A useful starting value when embedding the onboarding flow in another screen. */
export const createFamilyOnboardingDefaults = (): FamilyOnboardingValues => ({
  familyDetails: {
    familyHeadName: '',
    fatherOrHusbandName: '',
    mobileNumber: '',
    aadhaarNumber: '',
    tribalCommunity: '',
    casteCertificateNumber: '',
    address: '',
    village: '',
    panchayat: '',
    district: '',
    state: 'Tamil Nadu',
  },
  members: [emptyMember()],
  income: {
    annualIncome: 0,
    occupation: '',
    landOwnership: '',
    houseType: '',
    livestock: 'None declared',
    bankAccount: '',
    ifsc: '',
    rationCardNumber: '',
  },
  documents: [],
});

interface StoredDraft {
  version: number;
  savedAt: string;
  values: FamilyOnboardingValues;
}

/** Never persist identity or bank-account values in browser-local onboarding drafts. */
function sanitizeDraftValues(values: FamilyOnboardingValues): FamilyOnboardingValues {
  return {
    ...values,
    familyDetails: { ...values.familyDetails, aadhaarNumber: '' },
    members: values.members.map((member) => ({ ...member, aadhaarNumber: '' })),
    income: { ...values.income, bankAccount: '', ifsc: '' },
  };
}

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

/** Reads a locally stored onboarding draft, returning null when none can safely be restored. */
export function loadFamilyOnboardingDraft(key = DEFAULT_DRAFT_KEY): FamilyOnboardingValues | null {
  if (!canUseLocalStorage()) return null;

  try {
    const rawDraft = window.localStorage.getItem(key);
    if (!rawDraft) return null;
    const parsed = JSON.parse(rawDraft) as Partial<StoredDraft>;
    if (parsed.version !== DRAFT_VERSION || !parsed.values || typeof parsed.values !== 'object') return null;
    const safeValues = sanitizeDraftValues(parsed.values);
    // Upgrade an older local draft in place so sensitive values do not remain in storage.
    window.localStorage.setItem(key, JSON.stringify({ ...parsed, values: safeValues }));
    return safeValues;
  } catch {
    return null;
  }
}

/** Removes an offline draft after an application has been successfully submitted. */
export function clearFamilyOnboardingDraft(key = DEFAULT_DRAFT_KEY) {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Private browsing and restricted devices can reject storage access. The form remains usable.
  }
}

function saveFamilyOnboardingDraft(key: string, values: FamilyOnboardingValues) {
  if (!canUseLocalStorage()) return false;
  try {
    const draft: StoredDraft = { version: DRAFT_VERSION, savedAt: new Date().toISOString(), values: sanitizeDraftValues(values) };
    window.localStorage.setItem(key, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

function mergeInitialValues(
  initialValues?: Partial<FamilyOnboardingValues>,
  storedDraft?: FamilyOnboardingValues | null,
): FamilyOnboardingValues {
  const defaults = createFamilyOnboardingDefaults();
  const source = { ...storedDraft, ...initialValues };

  return {
    familyDetails: { ...defaults.familyDetails, ...storedDraft?.familyDetails, ...initialValues?.familyDetails },
    members: initialValues?.members ?? storedDraft?.members ?? defaults.members,
    income: { ...defaults.income, ...storedDraft?.income, ...initialValues?.income },
    documents: source.documents ?? defaults.documents,
  };
}

function maskSensitiveNumber(value: string) {
  if (!value) return 'Not provided';
  return `•••• •••• ${value.slice(-4)}`;
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function serializeDocuments(items: Partial<Record<OnboardingDocumentKey, DocumentUiItem>>) {
  return FAMILY_DOCUMENTS.flatMap((document) => {
    const item = items[document.key];
    if (!item) return [];
    const { previewUrl: _previewUrl, progress: _progress, state: _state, file: _file, ...record } = item;
    return [record];
  });
}

function hydrateDocuments(records: FamilyDocumentRecord[]) {
  return records.reduce<Partial<Record<OnboardingDocumentKey, DocumentUiItem>>>((items, record) => {
    items[record.key] = { ...record, progress: 100, state: 'draft' };
    return items;
  }, {});
}

const fieldGridSx = {
  display: 'grid',
  gap: 2,
  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
} as const;

const STEP_PATHS: FieldPath<FamilyOnboardingValues>[][] = [
  [
    'familyDetails.familyHeadName',
    'familyDetails.fatherOrHusbandName',
    'familyDetails.mobileNumber',
    'familyDetails.aadhaarNumber',
    'familyDetails.tribalCommunity',
    'familyDetails.casteCertificateNumber',
    'familyDetails.address',
    'familyDetails.village',
    'familyDetails.panchayat',
    'familyDetails.district',
    'familyDetails.state',
  ],
  ['members'],
  [
    'income.annualIncome',
    'income.occupation',
    'income.landOwnership',
    'income.houseType',
    'income.livestock',
    'income.bankAccount',
    'income.ifsc',
    'income.rationCardNumber',
  ],
  [],
  [],
];

const STEPS = ['Family details', 'Members', 'Income & assets', 'Documents', 'Review'];

/**
 * Accessible, mobile-first multi-step registration flow for a TribalConnect family.
 * It intentionally stores only document metadata in an offline draft; the original
 * document must be selected again after a page reload before submission.
 */
export function FamilyOnboardingPage({
  initialValues,
  villages = ['Kolli Hills', 'Kalrayan Hills', 'Jawadhu Hills', 'Pachamalai'],
  districts = ['Namakkal', 'Salem', 'Tiruvannamalai', 'Tiruchirappalli'],
  tribalCommunities = ['Irular', 'Malayali', 'Toda', 'Kota', 'Paniya', 'Other'],
  states = ['Tamil Nadu'],
  onSubmit,
  onDraftSaved,
  offlineDraftKey = DEFAULT_DRAFT_KEY,
  enableOfflineDraft = true,
  requiredDocuments = FAMILY_DOCUMENTS.filter((document) => document.required).map((document) => document.key),
  submitLabel = 'Submit family registration',
  onDistrictChange,
  allowExistingAadhaar = false,
}: FamilyOnboardingPageProps) {
  const [storedDraft] = useState<FamilyOnboardingValues | null>(() => (
    enableOfflineDraft ? loadFamilyOnboardingDraft(offlineDraftKey) : null
  ));
  const defaultValues = useMemo(
    () => mergeInitialValues(initialValues, storedDraft),
    [initialValues, storedDraft],
  );
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setValue,
    trigger,
    watch,
  } = useForm<FamilyOnboardingValues>({
    defaultValues,
    mode: 'onBlur',
    reValidateMode: 'onChange',
    context: { allowExistingAadhaar },
    resolver: yupResolver(familyOnboardingSchema) as Resolver<FamilyOnboardingValues>,
  });
  const { fields: members, append, remove } = useFieldArray({ control, name: 'members' });
  const reviewValues = useWatch({ control });
  const [activeStep, setActiveStep] = useState(0);
  const [documentItems, setDocumentItems] = useState<Partial<Record<OnboardingDocumentKey, DocumentUiItem>>>(() => (
    hydrateDocuments(defaultValues.documents)
  ));
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<'idle' | 'saved' | 'unavailable'>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const objectUrls = useRef<Partial<Record<OnboardingDocumentKey, string>>>({});

  const documentRecords = useMemo(() => serializeDocuments(documentItems), [documentItems]);

  useEffect(() => {
    setValue('documents', documentRecords, { shouldDirty: documentRecords.length > 0 });
  }, [documentRecords, setValue]);

  useEffect(() => () => {
    Object.values(objectUrls.current).forEach((url) => url && URL.revokeObjectURL(url));
  }, []);

  const saveDraft = useCallback((values: FamilyOnboardingValues) => {
    const payload = { ...values, documents: serializeDocuments(documentItems) };
    const saved = saveFamilyOnboardingDraft(offlineDraftKey, payload);
    setDraftStatus(saved ? 'saved' : 'unavailable');
    if (saved) onDraftSaved?.(sanitizeDraftValues(payload));
    return saved;
  }, [documentItems, offlineDraftKey, onDraftSaved]);

  useEffect(() => {
    if (!enableOfflineDraft) return undefined;
    let timeout: number | undefined;
    const subscription = watch((values) => {
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => saveDraft(values as FamilyOnboardingValues), 900);
    });
    return () => {
      if (timeout) window.clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [enableOfflineDraft, saveDraft, watch]);

  const missingRequiredDocuments = useMemo(
    () => requiredDocuments.filter((key) => documentItems[key]?.state !== 'ready'),
    [documentItems, requiredDocuments],
  );

  const selectDocument = (key: OnboardingDocumentKey, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;

    if (!ACCEPTED_DOCUMENT_TYPES.includes(file.type)) {
      setDocumentError('Use a JPG, PNG, WEBP, or PDF document.');
      return;
    }
    if (file.size > MAX_DOCUMENT_SIZE) {
      setDocumentError('Each document must be 5 MB or smaller.');
      return;
    }

    setDocumentError(null);
    const document = FAMILY_DOCUMENTS.find((item) => item.key === key)!;
    const previousUrl = objectUrls.current[key];
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
    if (previewUrl) objectUrls.current[key] = previewUrl;

    const item: DocumentUiItem = {
      key,
      label: document.label,
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      file,
      previewUrl,
      progress: 100,
      state: 'ready',
    };
    setDocumentItems((current) => ({ ...current, [key]: item }));
  };

  const removeDocument = (key: OnboardingDocumentKey) => {
    const previewUrl = objectUrls.current[key];
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    delete objectUrls.current[key];
    setDocumentItems((current) => {
      const { [key]: _removed, ...remaining } = current;
      return remaining;
    });
  };

  const moveToNextStep = async () => {
    setSubmitError(null);
    if (activeStep === 3 && missingRequiredDocuments.length > 0) {
      setDocumentError(`Please upload ${missingRequiredDocuments.map((key) => FAMILY_DOCUMENTS.find((item) => item.key === key)?.label).join(' and ')} before continuing.`);
      return;
    }
    const fieldsToValidate = STEP_PATHS[activeStep];
    const isValid = fieldsToValidate.length === 0 || await trigger(fieldsToValidate);
    if (isValid) setActiveStep((step) => Math.min(step + 1, STEPS.length - 1));
  };

  const submitRegistration = handleSubmit(async (values) => {
    if (missingRequiredDocuments.length > 0) {
      setActiveStep(3);
      setDocumentError('Required documents are missing. Please upload them before submitting.');
      return;
    }
    setSubmitError(null);
    if (!onSubmit) {
      setSubmitError('Family registration is not connected to a service yet. Please try again after the portal connection is restored.');
      return;
    }
    try {
      const payload = { ...values, documents: serializeDocuments(documentItems) };
      const files = FAMILY_DOCUMENTS.reduce<FamilyOnboardingFiles>((selected, document) => {
        const file = documentItems[document.key]?.file;
        if (file) selected[document.key] = file;
        return selected;
      }, {});
      await onSubmit(payload, files);
      if (enableOfflineDraft) clearFamilyOnboardingDraft(offlineDraftKey);
      setSuccessMessage('Family registration is ready for verification. A development officer can now review the submission.');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'The registration could not be submitted. Please try again.');
    }
  });

  const manualSave = () => {
    const values = watch();
    saveDraft(values);
  };

  return (
    <Box component="section" aria-labelledby="family-onboarding-title" sx={{ maxWidth: 1160, mx: 'auto', pb: 5 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-start' }} gap={2} mb={3}>
        <Box>
          <Typography component="h1" id="family-onboarding-title" variant="h4">Register a tribal family</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75, maxWidth: 700 }}>
            Complete the details with the family. You can save a local draft and continue later, even when connectivity is limited.
          </Typography>
        </Box>
        {enableOfflineDraft && (
          <Stack alignItems={{ xs: 'stretch', sm: 'flex-end' }} gap={0.5}>
            <Button variant="outlined" startIcon={<SaveOutlined />} onClick={manualSave}>Save offline draft</Button>
            <Typography variant="caption" color={draftStatus === 'unavailable' ? 'error' : 'text.secondary'} aria-live="polite">
              {draftStatus === 'saved' ? 'Draft saved on this device' : draftStatus === 'unavailable' ? 'Local draft storage is unavailable' : 'No draft saved yet'}
            </Typography>
          </Stack>
        )}
      </Stack>

      {storedDraft && enableOfflineDraft && (
        <Alert severity="info" sx={{ mb: 3 }}>
          A local draft was restored. For privacy, re-enter Aadhaar and bank details, and select documents again before submitting.
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, mb: 3, overflowX: 'auto' }}>
        <Stepper activeStep={activeStep} alternativeLabel sx={{ minWidth: 650 }}>
          {STEPS.map((step) => <Step key={step}><StepLabel>{step}</StepLabel></Step>)}
        </Stepper>
      </Paper>

      <Box component="form" noValidate onSubmit={submitRegistration} aria-describedby="onboarding-security-note">
        <Typography id="onboarding-security-note" variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          Aadhaar and bank information are displayed only in masked form in the review step. Confirm the details with the family before submitting.
        </Typography>

        {activeStep === 0 && (
          <Card component="fieldset" variant="outlined">
            <CardContent>
              <Typography component="legend" variant="h6" mb={0.5}>Family details</Typography>
              <Typography color="text.secondary" variant="body2" mb={3}>Use the details from the family&apos;s official records.</Typography>
              <Box sx={fieldGridSx}>
                <TextField label="Family head name" required autoComplete="name" {...register('familyDetails.familyHeadName')} error={Boolean(errors.familyDetails?.familyHeadName)} helperText={errors.familyDetails?.familyHeadName?.message} />
                <TextField label="Father / husband name" required {...register('familyDetails.fatherOrHusbandName')} error={Boolean(errors.familyDetails?.fatherOrHusbandName)} helperText={errors.familyDetails?.fatherOrHusbandName?.message} />
                <TextField label="Mobile number" required inputMode="numeric" autoComplete="tel" {...register('familyDetails.mobileNumber')} error={Boolean(errors.familyDetails?.mobileNumber)} helperText={errors.familyDetails?.mobileNumber?.message ?? '10-digit number used for updates'} />
                <TextField label="Aadhaar number" required={!allowExistingAadhaar} inputMode="numeric" autoComplete="off" {...register('familyDetails.aadhaarNumber')} error={Boolean(errors.familyDetails?.aadhaarNumber)} helperText={errors.familyDetails?.aadhaarNumber?.message ?? (allowExistingAadhaar ? 'Leave blank to retain the protected Aadhaar value already on file.' : '12 digits; never share this outside the secure portal')} />
                <TextField select label="Tribal community" required {...register('familyDetails.tribalCommunity')} error={Boolean(errors.familyDetails?.tribalCommunity)} helperText={errors.familyDetails?.tribalCommunity?.message}>
                  <MenuItem value="">Select community</MenuItem>
                  {tribalCommunities.map((community) => <MenuItem key={community} value={community}>{community}</MenuItem>)}
                </TextField>
                <TextField label="Caste certificate number" required {...register('familyDetails.casteCertificateNumber')} error={Boolean(errors.familyDetails?.casteCertificateNumber)} helperText={errors.familyDetails?.casteCertificateNumber?.message} />
                <TextField label="House address" required multiline minRows={2} sx={{ gridColumn: { md: 'span 2' } }} {...register('familyDetails.address')} error={Boolean(errors.familyDetails?.address)} helperText={errors.familyDetails?.address?.message} />
                <TextField select label="Village" required {...register('familyDetails.village')} error={Boolean(errors.familyDetails?.village)} helperText={errors.familyDetails?.village?.message}>
                  <MenuItem value="">Select village</MenuItem>
                  {villages.map((village) => <MenuItem key={village} value={village}>{village}</MenuItem>)}
                </TextField>
                <TextField label="Panchayat" required {...register('familyDetails.panchayat')} error={Boolean(errors.familyDetails?.panchayat)} helperText={errors.familyDetails?.panchayat?.message} />
                <TextField select label="District" required {...register('familyDetails.district')} onChange={(event) => {
                  register('familyDetails.district').onChange(event);
                  setValue('familyDetails.village', '', { shouldValidate: true });
                  onDistrictChange?.(event.target.value);
                }} error={Boolean(errors.familyDetails?.district)} helperText={errors.familyDetails?.district?.message}>
                  <MenuItem value="">Select district</MenuItem>
                  {districts.map((district) => <MenuItem key={district} value={district}>{district}</MenuItem>)}
                </TextField>
                <TextField select label="State" required {...register('familyDetails.state')} error={Boolean(errors.familyDetails?.state)} helperText={errors.familyDetails?.state?.message}>
                  {states.map((state) => <MenuItem key={state} value={state}>{state}</MenuItem>)}
                </TextField>
              </Box>
            </CardContent>
          </Card>
        )}

        {activeStep === 1 && (
          <Stack gap={2}>
            <Alert severity="info">Add every person who lives in the household. You can add as many members as needed.</Alert>
            {errors.members?.message && <Alert severity="error">{errors.members.message}</Alert>}
            {members.map((member, index) => {
              const memberErrors = errors.members?.[index];
              return (
                <Card key={member.id} component="fieldset" variant="outlined">
                  <CardContent>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                      <Typography component="legend" variant="h6">Family member {index + 1}</Typography>
                      <Tooltip title={members.length === 1 ? 'At least one household member is required' : 'Remove this member'}>
                        <span>
                          <IconButton aria-label={`Remove family member ${index + 1}`} color="error" disabled={members.length === 1} onClick={() => remove(index)}>
                            <DeleteOutline />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                    <Box sx={fieldGridSx}>
                      <TextField label="Full name" required autoComplete="name" {...register(`members.${index}.name`)} error={Boolean(memberErrors?.name)} helperText={memberErrors?.name?.message} />
                      <TextField select label="Gender" required {...register(`members.${index}.gender`)} error={Boolean(memberErrors?.gender)} helperText={memberErrors?.gender?.message}>
                        <MenuItem value="Female">Female</MenuItem><MenuItem value="Male">Male</MenuItem><MenuItem value="Other">Other</MenuItem><MenuItem value="Prefer not to say">Prefer not to say</MenuItem>
                      </TextField>
                      <TextField label="Date of birth" type="date" required InputLabelProps={{ shrink: true }} {...register(`members.${index}.dob`)} error={Boolean(memberErrors?.dob)} helperText={memberErrors?.dob?.message} />
                      <TextField label="Age" type="number" required inputProps={{ min: 0, max: 120 }} {...register(`members.${index}.age`, { valueAsNumber: true })} error={Boolean(memberErrors?.age)} helperText={memberErrors?.age?.message} />
                      <TextField label="Relationship to family head" required {...register(`members.${index}.relationship`)} error={Boolean(memberErrors?.relationship)} helperText={memberErrors?.relationship?.message} />
                      <TextField label="Occupation" required {...register(`members.${index}.occupation`)} error={Boolean(memberErrors?.occupation)} helperText={memberErrors?.occupation?.message} />
                      <TextField label="Education" required {...register(`members.${index}.education`)} error={Boolean(memberErrors?.education)} helperText={memberErrors?.education?.message} />
                      <TextField label="Disability status" required {...register(`members.${index}.disability`)} error={Boolean(memberErrors?.disability)} helperText={memberErrors?.disability?.message ?? 'For example: no disability declared'} />
                      <TextField label="Aadhaar number (optional)" inputMode="numeric" autoComplete="off" sx={{ gridColumn: { md: 'span 2' } }} {...register(`members.${index}.aadhaarNumber`)} error={Boolean(memberErrors?.aadhaarNumber)} helperText={memberErrors?.aadhaarNumber?.message} />
                    </Box>
                  </CardContent>
                </Card>
              );
            })}
            <Button variant="outlined" startIcon={<Add />} onClick={() => append(emptyMember())} sx={{ alignSelf: 'flex-start' }}>Add family member</Button>
          </Stack>
        )}

        {activeStep === 2 && (
          <Card component="fieldset" variant="outlined">
            <CardContent>
              <Typography component="legend" variant="h6" mb={0.5}>Income, home and banking details</Typography>
              <Typography color="text.secondary" variant="body2" mb={3}>This information helps the portal recommend the right welfare schemes.</Typography>
              <Box sx={fieldGridSx}>
                <TextField label="Annual household income (₹)" required type="number" inputProps={{ min: 0 }} {...register('income.annualIncome', { valueAsNumber: true })} error={Boolean(errors.income?.annualIncome)} helperText={errors.income?.annualIncome?.message} />
                <TextField label="Primary occupation" required {...register('income.occupation')} error={Boolean(errors.income?.occupation)} helperText={errors.income?.occupation?.message} />
                <TextField select label="Land ownership" required {...register('income.landOwnership')} error={Boolean(errors.income?.landOwnership)} helperText={errors.income?.landOwnership?.message}>
                  <MenuItem value="">Select ownership</MenuItem><MenuItem value="Landless">Landless</MenuItem><MenuItem value="Less than 1 acre">Less than 1 acre</MenuItem><MenuItem value="1–2 acres">1–2 acres</MenuItem><MenuItem value="More than 2 acres">More than 2 acres</MenuItem>
                </TextField>
                <TextField select label="House type" required {...register('income.houseType')} error={Boolean(errors.income?.houseType)} helperText={errors.income?.houseType?.message}>
                  <MenuItem value="">Select house type</MenuItem><MenuItem value="Kutcha">Kutcha</MenuItem><MenuItem value="Semi-pucca">Semi-pucca</MenuItem><MenuItem value="Pucca">Pucca</MenuItem><MenuItem value="Homeless / temporary">Homeless / temporary</MenuItem>
                </TextField>
                <TextField label="Livestock details" required {...register('income.livestock')} error={Boolean(errors.income?.livestock)} helperText={errors.income?.livestock?.message ?? 'Write “None declared” if applicable'} />
                <TextField label="Ration card number" required {...register('income.rationCardNumber')} error={Boolean(errors.income?.rationCardNumber)} helperText={errors.income?.rationCardNumber?.message} />
                <TextField label="Bank account number" required={!allowExistingAadhaar} inputMode="numeric" autoComplete="off" {...register('income.bankAccount')} error={Boolean(errors.income?.bankAccount)} helperText={errors.income?.bankAccount?.message ?? (allowExistingAadhaar ? 'Leave blank to retain the protected account already on file.' : undefined)} />
                <TextField label="IFSC code" required={!allowExistingAadhaar} autoCapitalize="characters" {...register('income.ifsc')} error={Boolean(errors.income?.ifsc)} helperText={errors.income?.ifsc?.message ?? (allowExistingAadhaar ? 'Leave blank to retain the protected IFSC already on file.' : undefined)} />
              </Box>
            </CardContent>
          </Card>
        )}

        {activeStep === 3 && (
          <Stack gap={2}>
            <Alert severity="info">Upload a clear photo or PDF. Files are checked on this device and securely uploaded when the family registration is submitted.</Alert>
            {documentError && <Alert severity="error" onClose={() => setDocumentError(null)}>{documentError}</Alert>}
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' } }}>
              {FAMILY_DOCUMENTS.map((document) => {
                const item = documentItems[document.key];
                const isUploaded = item?.state === 'ready';
                return (
                  <Card key={document.key} variant="outlined" sx={{ minHeight: 218 }}>
                    <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                      <Stack direction="row" justifyContent="space-between" gap={1} alignItems="flex-start">
                        <Box>
                          <Typography variant="subtitle1" fontWeight={750}>{document.label}</Typography>
                          <Typography variant="caption" color="text.secondary">JPG, PNG, WEBP or PDF · up to 5 MB</Typography>
                        </Box>
                        {document.required && <Chip label="Required" size="small" color="primary" variant="outlined" />}
                      </Stack>
                      <Box sx={{ flex: 1, mt: 2 }}>
                        {!item && <Typography variant="body2" color="text.secondary">No document selected</Typography>}
                        {item && (
                          <Stack gap={1.25}>
                            {item.previewUrl ? (
                              <Box component="img" src={item.previewUrl} alt={`Preview of ${document.label}`} sx={{ width: 80, height: 58, borderRadius: 1, objectFit: 'cover', border: 1, borderColor: 'divider' }} />
                            ) : <DescriptionOutlined color="action" aria-label="Document file" />}
                            <Box>
                              <Typography variant="body2" noWrap title={item.fileName}>{item.fileName}</Typography>
                              <Typography variant="caption" color="text.secondary">{formatFileSize(item.size)} · {item.state === 'draft' ? 'Select again to submit' : isUploaded ? 'Ready' : 'Uploading'}</Typography>
                            </Box>
                            {item.state === 'uploading' && <LinearProgress variant="determinate" value={item.progress} aria-label={`${document.label} upload progress`} />}
                            {item.state === 'ready' && <Stack direction="row" alignItems="center" gap={0.5}><CheckCircleOutline color="success" fontSize="small" /><Typography variant="caption" color="success.main">Ready for secure upload</Typography></Stack>}
                          </Stack>
                        )}
                      </Box>
                      <Stack direction="row" gap={1} mt={2}>
                        <Button component="label" variant={item ? 'outlined' : 'contained'} size="small" startIcon={<UploadFileOutlined />} disabled={item?.state === 'uploading'}>
                          {item ? 'Replace' : 'Choose file'}
                          <input hidden type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => selectDocument(document.key, event)} />
                        </Button>
                        {item && <Button size="small" color="error" onClick={() => removeDocument(document.key)}>Remove</Button>}
                      </Stack>
                    </CardContent>
                  </Card>
                );
              })}
            </Box>
          </Stack>
        )}

        {activeStep === 4 && (
          <Stack gap={2}>
            {successMessage && <Alert severity="success" aria-live="polite">{successMessage}</Alert>}
            {submitError && <Alert severity="error" aria-live="assertive">{submitError}</Alert>}
            <Alert severity={missingRequiredDocuments.length ? 'warning' : 'success'}>
              {missingRequiredDocuments.length
                ? `Before submission, upload: ${missingRequiredDocuments.map((key) => FAMILY_DOCUMENTS.find((item) => item.key === key)?.label).join(', ')}.`
                : 'All required documents are ready. Review the details with the family before submitting.'}
            </Alert>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" mb={2}>Family details</Typography>
                <Box sx={fieldGridSx}>
                  <ReviewItem label="Family head" value={reviewValues.familyDetails?.familyHeadName} />
                  <ReviewItem label="Mobile" value={reviewValues.familyDetails?.mobileNumber} />
                  <ReviewItem label="Aadhaar" value={maskSensitiveNumber(reviewValues.familyDetails?.aadhaarNumber ?? '')} />
                  <ReviewItem label="Community" value={reviewValues.familyDetails?.tribalCommunity} />
                  <ReviewItem label="Location" value={[reviewValues.familyDetails?.village, reviewValues.familyDetails?.panchayat, reviewValues.familyDetails?.district].filter(Boolean).join(', ')} />
                  <ReviewItem label="Address" value={reviewValues.familyDetails?.address} />
                </Box>
              </CardContent>
            </Card>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" mb={1}>Household and income</Typography>
                <Typography variant="body2" color="text.secondary">{reviewValues.members?.length ?? 0} family member(s) · {reviewValues.income?.occupation || 'Occupation not provided'} · Annual income ₹{Number(reviewValues.income?.annualIncome || 0).toLocaleString('en-IN')}</Typography>
                <Divider sx={{ my: 2 }} />
                <Stack direction="row" flexWrap="wrap" gap={1}>
                  {documentRecords.map((document) => <Chip key={document.key} icon={<CheckCircleOutline />} color={documentItems[document.key]?.state === 'ready' ? 'success' : 'default'} label={document.label} />)}
                  {!documentRecords.length && <Typography variant="body2" color="text.secondary">No documents selected</Typography>}
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        )}

        <Stack direction="row" justifyContent="space-between" gap={2} mt={3}>
          <Button type="button" startIcon={<ArrowBack />} disabled={activeStep === 0 || isSubmitting} onClick={() => setActiveStep((step) => Math.max(0, step - 1))}>Back</Button>
          {activeStep < STEPS.length - 1 ? (
            <Button type="button" variant="contained" endIcon={<ArrowForward />} onClick={moveToNextStep}>Continue</Button>
          ) : (
            <Button type="submit" variant="contained" disabled={isSubmitting} startIcon={<CheckCircleOutline />}>
              {isSubmitting ? 'Submitting…' : submitLabel}
            </Button>
          )}
        </Stack>
      </Box>
    </Box>
  );
}

function ReviewItem({ label, value }: { label: string; value?: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={650}>{value || 'Not provided'}</Typography>
    </Box>
  );
}

export default FamilyOnboardingPage;
