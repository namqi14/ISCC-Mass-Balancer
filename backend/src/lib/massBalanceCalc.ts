/**
 * ISCC Mass Balance -- pure calculation layer.
 *
 * Direct TypeScript port of the pure functions in
 * References/mass_balance_engine.py. No database access here on purpose --
 * this is what gets unit-tested against known ISCC worked examples.
 *
 * Formula as specified: B = (A + a) * CF + b
 *   A  = incoming volume this period (inbound + conversion-in)
 *   a  = opening input inventory carried into this period
 *   CF = conversion factor
 *   b  = opening output inventory carried into this period
 *   B  = total available sustainable material this period
 *   C  = outgoing volume this period (outbound + conversion-out)
 *
 * This shape is standard for EU biofuel sustainability schemes, but exact
 * variable definitions can differ slightly between scheme versions -- have
 * an ISCC auditor confirm the formula against the current System Document
 * before relying on it in production.
 */

import { Prisma } from "@prisma/client";
import { NegativeBalanceError } from "./errors";

export const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

export const TOLERANCE_PCT = D("0.5"); // Rule 8

export enum AlertSeverity {
  INFO = "INFO",
  WARNING = "WARNING",
  CRITICAL = "CRITICAL",
}

export interface Alert {
  code: string;
  severity: AlertSeverity;
  message: string;
}

export interface PeriodBalanceResult {
  incomingA: Prisma.Decimal;
  openingInputInventoryA: Prisma.Decimal;
  conversionFactorCf: Prisma.Decimal;
  openingOutputInventoryB: Prisma.Decimal;
  totalAvailableB: Prisma.Decimal;
  outgoingC: Prisma.Decimal;
  closingBalance: Prisma.Decimal;
  creditsCarriedForward: Prisma.Decimal;
  ghgValueAssigned: Prisma.Decimal;
  alerts: Alert[];
}

/** B = (A + a) * CF + b */
export function calculateTotalAvailable(
  incomingA: Prisma.Decimal,
  openingInputInventoryA: Prisma.Decimal,
  conversionFactorCf: Prisma.Decimal,
  openingOutputInventoryB: Prisma.Decimal
): Prisma.Decimal {
  return incomingA.plus(openingInputInventoryA).times(conversionFactorCf).plus(openingOutputInventoryB);
}

/** Rule 5. Hard exception if C > B. Returns the closing balance (B - C) if the
 * check passes -- callers should not compute B - C themselves, so this check
 * can never be silently skipped. */
export function enforceNoNegativeBalance(totalAvailableB: Prisma.Decimal, outgoingC: Prisma.Decimal): Prisma.Decimal {
  if (outgoingC.greaterThan(totalAvailableB)) {
    throw new NegativeBalanceError(
      `Outgoing volume (${outgoingC}) exceeds total available sustainable material (${totalAvailableB}) ` +
        `at period end. Deficit: ${outgoingC.minus(totalAvailableB)}.`
    );
  }
  return totalAvailableB.minus(outgoingC);
}

/** Rule 7: merged batches take the MAX (worst) GHG value of their sources --
 * never a volume-weighted average. */
export function assignMergedGhgValue(sourceGhgValues: Prisma.Decimal[]): Prisma.Decimal {
  if (sourceGhgValues.length === 0) {
    throw new Error("Cannot merge a batch with no source GHG values.");
  }
  return sourceGhgValues.reduce((max, v) => (v.greaterThan(max) ? v : max), sourceGhgValues[0]);
}

/**
 * Rule 6.
 * ISCC EU: capped at the site's total physical stock (certified + fossil).
 * ISCC PLUS: uncapped -- carries forward in full regardless of physical
 * stock on hand.
 */
export function calculateCreditCarryForward(
  certScheme: "ISCC_EU" | "ISCC_PLUS",
  closingBalance: Prisma.Decimal,
  physicalStockTotal: Prisma.Decimal | null
): { carryForward: Prisma.Decimal; alerts: Alert[] } {
  const alerts: Alert[] = [];

  if (closingBalance.lessThanOrEqualTo(0)) {
    return { carryForward: D(0), alerts };
  }

  if (certScheme === "ISCC_PLUS") {
    return { carryForward: closingBalance, alerts };
  }

  // ISCC_EU
  if (physicalStockTotal === null) {
    alerts.push({
      code: "EU_NO_PHYSICAL_STOCK_READING",
      severity: AlertSeverity.CRITICAL,
      message:
        "ISCC EU site has no physical stock reading for this period end. Credit carry-forward cannot be " +
        "validated against physical stock and has been set to 0 pending a stocktake.",
    });
    return { carryForward: D(0), alerts };
  }

  if (closingBalance.greaterThan(physicalStockTotal)) {
    const capped = physicalStockTotal;
    alerts.push({
      code: "EU_CARRY_FORWARD_CAPPED",
      severity: AlertSeverity.WARNING,
      message:
        `ISCC EU physical stock requirement not met for full credit carry-forward: booked closing balance ` +
        `(${closingBalance}) exceeds physical stock on site (${physicalStockTotal}). Carry-forward capped at ` +
        `${capped}; the remaining ${closingBalance.minus(capped)} cannot be carried forward under ISCC EU.`,
    });
    return { carryForward: capped, alerts };
  }

  return { carryForward: closingBalance, alerts };
}

/** Rule 8: a 0.5% variance between booked and physical stock is allowed
 * without an audit alert. Returns an Alert if the variance exceeds that. */
export function checkStockTolerance(bookedStock: Prisma.Decimal, physicalStock: Prisma.Decimal): Alert | null {
  let variancePct: Prisma.Decimal;
  if (bookedStock.equals(0)) {
    if (physicalStock.equals(0)) return null;
    variancePct = D(100);
  } else {
    variancePct = bookedStock.minus(physicalStock).abs().dividedBy(bookedStock.abs()).times(100);
  }

  if (variancePct.greaterThan(TOLERANCE_PCT)) {
    return {
      code: "STOCK_TOLERANCE_BREACH",
      severity: AlertSeverity.WARNING,
      message:
        `Booked stock (${bookedStock}) vs. physical stock (${physicalStock}) differ by ${variancePct.toFixed(3)}%, ` +
        `exceeding the ${TOLERANCE_PCT}% tolerance. Flagged for audit review.`,
    };
  }
  return null;
}

/**
 * End-to-end pure calculation for one (period, product_type): computes B,
 * enforces the no-negative-balance rule, and derives the carry-forward
 * amount. Throws NegativeBalanceError if C > B -- this function will not
 * return a result that violates Rule 5.
 */
export function computePeriodBalance(input: {
  incomingA: Prisma.Decimal;
  openingInputInventoryA: Prisma.Decimal;
  conversionFactorCf: Prisma.Decimal;
  openingOutputInventoryB: Prisma.Decimal;
  outgoingC: Prisma.Decimal;
  certScheme: "ISCC_EU" | "ISCC_PLUS";
  ghgValueAssigned: Prisma.Decimal;
  physicalStockTotal: Prisma.Decimal | null;
}): PeriodBalanceResult {
  const alerts: Alert[] = [];

  const totalAvailableB = calculateTotalAvailable(
    input.incomingA,
    input.openingInputInventoryA,
    input.conversionFactorCf,
    input.openingOutputInventoryB
  );

  // Rule 5 -- hard stop, not a soft alert. Deliberately not caught here; it
  // propagates to the caller so a period cannot be closed over it.
  const closingBalance = enforceNoNegativeBalance(totalAvailableB, input.outgoingC);

  if (input.outgoingC.greaterThan(totalAvailableB.times("0.95"))) {
    // Soft early-warning well before the hard failure threshold, useful
    // mid-period before the period actually closes.
    alerts.push({
      code: "SALES_NEAR_AVAILABLE_LIMIT",
      severity: AlertSeverity.WARNING,
      message:
        `Sales (${input.outgoingC}) are approaching available credits (${totalAvailableB}) for this period. ` +
        `Remaining headroom: ${totalAvailableB.minus(input.outgoingC)}.`,
    });
  }

  const { carryForward, alerts: cfAlerts } = calculateCreditCarryForward(
    input.certScheme,
    closingBalance,
    input.physicalStockTotal
  );
  alerts.push(...cfAlerts);

  if (input.physicalStockTotal !== null) {
    const toleranceAlert = checkStockTolerance(closingBalance, input.physicalStockTotal);
    if (toleranceAlert) alerts.push(toleranceAlert);
  }

  return {
    incomingA: input.incomingA,
    openingInputInventoryA: input.openingInputInventoryA,
    conversionFactorCf: input.conversionFactorCf,
    openingOutputInventoryB: input.openingOutputInventoryB,
    totalAvailableB,
    outgoingC: input.outgoingC,
    closingBalance,
    creditsCarriedForward: carryForward,
    ghgValueAssigned: input.ghgValueAssigned,
    alerts,
  };
}
