/**
 * Business-rule errors. Each maps 1:1 to a rule from References/mass_balance_engine.py
 * (plus a few added for the extra rules in the DBML/quotation: 3-month period cap,
 * one-directional scheme transfers, processing-unit-only conversions).
 *
 * All of these are hard stops -- the route layer catches `AppError` and returns
 * a 4xx with `error.message`, so the user always gets a plain-English reason a
 * write was rejected, per the proposal's "clear explanation whenever an entry
 * is rejected" requirement.
 */

export class AppError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "MASS_BALANCE_ERROR") {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

/** Rule 5: C > B at period end. This must never be allowed to post. */
export class NegativeBalanceError extends AppError {
  constructor(message: string) {
    super(message, 400, "NEGATIVE_BALANCE");
  }
}

/** Rule 2: a new period does not start immediately after the previous
 * period's end_date, skips a site's chain entirely, or exceeds the 3-month cap. */
export class PeriodContinuityError extends AppError {
  constructor(message: string) {
    super(message, 400, "PERIOD_CONTINUITY");
  }
}

/** Rule 3: an INBOUND transaction has no weighbridge ticket / delivery note attached. */
export class PhysicalLinkMissingError extends AppError {
  constructor(message: string) {
    super(message, 400, "PHYSICAL_LINK_MISSING");
  }
}

/** Rule 1: an operation tried to pool batches or balances across more than
 * one site while the site's multiSiteBalancingEnabled flag is false. */
export class MultiSiteBalancingDisabledError extends AppError {
  constructor(message: string) {
    super(message, 400, "MULTI_SITE_DISABLED");
  }
}

/** Outgoing volume (sale/delivery/conversion-out) exceeds what is on hand. */
export class InsufficientStockError extends AppError {
  constructor(message: string) {
    super(message, 400, "INSUFFICIENT_STOCK");
  }
}

/** Cross-scheme transfer attempted in the disallowed direction (PLUS -> EU),
 * or between sites that are not EU-source / PLUS-target. */
export class SchemeTransferDirectionError extends AppError {
  constructor(message: string) {
    super(message, 400, "SCHEME_TRANSFER_DIRECTION");
  }
}

/** A conversion event was attempted at a site that is not a PROCESSING_UNIT. */
export class ConversionNotAllowedError extends AppError {
  constructor(message: string) {
    super(message, 400, "CONVERSION_NOT_ALLOWED");
  }
}

/** A write was attempted against a CLOSED period. */
export class PeriodClosedError extends AppError {
  constructor(message: string) {
    super(message, 400, "PERIOD_CLOSED");
  }
}

/** A PLUS-to-PLUS multi-site credit transfer was attempted between two
 * sites that don't qualify: not both ISCC_PLUS, or not in the same/a
 * neighboring country (client clarification -- see createPlusToPlusTransfer). */
export class PlusToPlusTransferNotAllowedError extends AppError {
  constructor(message: string) {
    super(message, 400, "PLUS_TO_PLUS_TRANSFER_NOT_ALLOWED");
  }
}

/** A period's start/end date falls outside the site's current ISCC
 * certificate validity window (client clarification, 2026-08-25 -- see
 * openNewPeriod). Only thrown when the site actually has a certificate on
 * file (certifiedFrom/certifiedTo both set); a site with none yet is
 * unconstrained by this check. */
export class CertificateValidityError extends AppError {
  constructor(message: string) {
    super(message, 400, "CERTIFICATE_VALIDITY");
  }
}

/** Two concurrent requests tried to close the same period/product type at
 * once. Both read status=OPEN before either committed; PeriodBalance's
 * `@@unique([periodId, productType])` constraint stops the second one from
 * writing a duplicate/conflicting balance -- this is that rejection's
 * clean message, not a data-integrity bug. */
export class PeriodCloseConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "PERIOD_CLOSE_CONFLICT");
  }
}
