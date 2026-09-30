export type UserRole = "SUPER_ADMIN" | "COMPANY_ADMIN" | "COMPANY_USER";
export type CertScheme = "ISCC_EU" | "ISCC_PLUS";
export type OperatorType = "TRADER" | "PROCESSING_UNIT";
export type ProductType = "BIOMETHANE" | "BIOLNG";
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
  operatorType: OperatorType;
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
  unit: "M3" | "METRIC_TONS" | "KG" | "M3_15C" | "J" | "KWH";
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
