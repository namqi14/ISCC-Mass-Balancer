export type UserRole = "SUPER_ADMIN" | "COMPANY_ADMIN" | "COMPANY_USER";
export type CertScheme = "ISCC_EU" | "ISCC_PLUS";
export type OperatorType = "TRADER" | "PROCESSING_UNIT";
export type ProductType = "POME" | "BIOGAS" | "BIOMETHANE" | "BIOLNG";
/** NM3 = normal cubic metre (0 C, 1 atm), the unit the client quotes gas conversion rates in. */
export type Unit = "M3" | "NM3" | "METRIC_TONS" | "KG" | "M3_15C" | "J" | "KWH";
export type TransactionType = "INBOUND" | "OUTBOUND" | "CONVERSION_IN" | "CONVERSION_OUT";
export type PeriodStatus = "OPEN" | "CLOSED";
export type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  companyId: number;
}

export interface Site {
  id: number;
  companyId: number;
  name: string;
  locationId: string;
  country: string;
  certScheme: CertScheme;
  /** Derived by the backend from the three stage flags below (any stage on =
   * PROCESSING_UNIT) -- not set directly by the client anymore. */
  operatorType: OperatorType;
  /** Conversion stages this site runs, in any combination: P1 = POME to
   * Biogas, P2 = Biogas to Biomethane, P3 = Biomethane to Bio-LNG, P4 = Bio-LNG back
   * to Biomethane (regasification). See
   * CONVERSION_STAGES in lib/constants.ts (mirrors backend
   * lib/conversionStages.ts). */
  canConvertP1: boolean;
  canConvertP2: boolean;
  canConvertP3: boolean;
  canConvertP4: boolean;
  multiSiteBalancingEnabled: boolean;
  defaultPeriodLengthMonths: number;
  createdAt: string;
  /** The site's real ISCC certificate on file -- all optional, a site may
   * not have one recorded yet. certifiedFrom/To bound what period dates
   * openNewPeriod will accept for this site (see backend sites.routes.ts). */
  certificateNumber?: string | null;
  certifyingBody?: string | null;
  certifiedFrom?: string | null;
  certifiedTo?: string | null;
  certifiedSiteRoles?: string | null;
  /** Set once a certificate PDF has been uploaded via
   * POST /sites/parse-certificate and the site form saved. */
  certificateFileUrl?: string | null;
}

/** A company's own account/profile record. `isActive`/`maxSites` are
 * SUPER_ADMIN-only to change (surfaced here read-only) -- see
 * backend/src/routes/companies.routes.ts's `GET/PATCH /me`. */
export interface Company {
  id: number;
  name: string;
  registrationNumber: string;
  isActive: boolean;
  maxSites: number | null;
  address: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  logoUrl: string | null;
  createdAt: string;
}

export interface Period {
  id: number;
  companyId: number;
  siteId: number;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  previousPeriodId: number | null;
  closedAt: string | null;
  closedById: number | null;
  site?: Site;
  balances?: PeriodBalance[];
}

export interface PeriodBalance {
  id: number;
  periodId: number;
  productType: ProductType;
  incomingA: string;
  openingInputInventoryA: string;
  conversionFactorCf: string;
  openingOutputInventoryB: string;
  totalAvailableB: string;
  outgoingC: string;
  closingBalance: string;
  creditsCarriedForward: string;
  ghgValueAssigned: string;
  computedAt: string;
}

export interface Alert {
  code: string;
  severity: AlertSeverity;
  message: string;
}

export interface Batch {
  id: number;
  companyId: number;
  siteId: number;
  certScheme: CertScheme;
  rawMaterial: string;
  countryOfOrigin: string;
  ghgValue: string;
  ghgValueType: "DDV" | "DV" | "AV";
  materialCategory: string;
  wasteStatus: "PRE_CONSUMER" | "POST_CONSUMER" | "MIXED" | "UNSPECIFIED" | null;
  unit: Unit;
  productType: ProductType;
  isMerged: boolean;
  createdAt: string;
  site?: Site;
  availableVolume?: string;
  /** True if a CONVERSION_IN transaction ever credited this pool -- gates
   * whether "Conversion trace" has anything real to show. */
  hasConversionTrace?: boolean;
}

/** GET /api/batches/:id/trace. See the endpoint's own comment in
 * backend/src/routes/batches.routes.ts: `conversionEvent` is always real;
 * `periodBalance` is `null` until the period actually closes, not a
 * best-effort estimate -- the frontend must not paper over that gap. */
export interface ConversionTrace {
  batchId: number;
  productType: ProductType;
  ghgValue: string;
  conversionEvent: {
    id: number;
    conversionDate: string;
    conversionFactorCf: string;
    sourceVolume: string;
    resultVolume: string;
    sourceBatch: {
      id: number;
      productType: ProductType;
      rawMaterial: string;
      countryOfOrigin: string;
      certScheme: CertScheme;
    };
  };
  period: {
    id: number;
    startDate: string;
    endDate: string;
    status: PeriodStatus;
  };
  periodBalance: {
    incomingA: string;
    openingInputInventoryA: string;
    conversionFactorCf: string;
    openingOutputInventoryB: string;
    totalAvailableB: string;
    outgoingC: string;
    closingBalance: string;
    creditsCarriedForward: string;
  } | null;
  merge: {
    assignedGhgValue: string;
    sources: { batchId: number; ghgValue: string; contributedVolume: string }[];
  } | null;
}

export interface PhysicalDocument {
  id: number;
  documentType: string;
  documentNumber: string;
  documentDate: string;
  issuedBy: string | null;
  fileReference: string | null;
}

export interface Transaction {
  id: number;
  companyId: number;
  siteId: number;
  periodId: number;
  batchId: number;
  transactionType: TransactionType;
  volume: string;
  transactionDate: string;
  counterpartyName: string | null;
  counterpartyCertNumber: string | null;
  physicalDocumentId: number | null;
  createdAt: string;
  batch?: Batch;
  site?: Site;
  physicalDocument?: PhysicalDocument | null;
  createdBy?: { id: number; name: string } | null;
}

export interface ConversionEvent {
  id: number;
  siteId: number;
  periodId: number;
  conversionFactorCf: string;
  conversionDate: string;
  site?: Site;
  lines?: { id: number; role: "INPUT" | "OUTPUT"; transaction: Transaction }[];
}

export interface SchemeTransfer {
  id: number;
  sourceSiteId: number;
  targetSiteId: number;
  // Raw column (matches Database Schema.pdf's single `batch_id`): the EU
  // source pool. `sourceBatch`/`targetBatch` below are server-computed --
  // the target pool is derived from the linked INBOUND transaction, not a column.
  batchId: number;
  volume: string;
  transferDate: string;
  sourceSite?: Site;
  targetSite?: Site;
  sourceBatch?: Batch;
  targetBatch?: Batch | null;
}

export interface PhysicalStockReading {
  id: number;
  siteId: number;
  readingDate: string;
  certifiedStockQty: string;
  fossilStockQty: string;
  source: "SENSOR" | "MANUAL_STOCKTAKE";
}

export interface AuditLogEntry {
  id: number;
  entityType: string;
  entityId: number;
  action: string;
  actorName: string;
  timestamp: string;
  beforeValue: string | null;
  afterValue: string | null;
  notes: string | null;
}

export interface PeriodTrendPoint {
  periodId: number;
  siteName: string;
  productType: string;
  endDate: string;
  totalAvailableB: string;
  outgoingC: string;
  closingBalance: string;
}

export interface DashboardData {
  siteCount: number;
  openPeriodCount: number;
  poolCount: number;
  biomethaneBalance: string;
  biolngBalance: string;
  recentAudit: AuditLogEntry[];
  /** Real closing balances from the last 12 closed periods (oldest -> newest),
   * as persisted by the engine at close time. Not synthetic. */
  periodTrend: PeriodTrendPoint[];
}

export interface ManagedUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  siteIds: number[];
  createdAt: string;
}

export interface ApiErrorBody {
  error: string;
  code?: string;
}

/** One allowed source unit for a conversion stage, from GET /conversions/stages. */
export interface StageUnitRule {
  sourceUnit: Unit;
  targetUnit: Unit;
  /** e.g. "Nm3 biogas per m3 POME" */
  perUnitText: string;
  /** The client document's typical range -- a HINT only, never applied or enforced. */
  typical: { min: number; max: number; basis: string };
}

export interface StageInfo {
  stage: "P1" | "P2" | "P3" | "P4";
  source: ProductType;
  target: ProductType;
  label: string;
  unitRules: StageUnitRule[];
}

/** A site's dated conversion rate (user-maintained; see backend ConversionRate). */
export interface ConversionRate {
  id: number;
  siteId: number;
  stage: "P1" | "P2" | "P3" | "P4";
  sourceUnit: Unit;
  factor: string;
  minFactor: string | null;
  maxFactor: string | null;
  effectiveFrom: string;
  note: string | null;
}
