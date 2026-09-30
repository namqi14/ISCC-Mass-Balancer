"""
ISCC Mass Balance Bookkeeping Tool -- Core Engine
==================================================

This module implements the actual business rules on top of the schema in
models.py. It's split into two layers on purpose:

1. Pure calculation functions (no DB access, take/return Decimals and
   dataclasses) -- these are what you unit-test against known ISCC
   worked examples without needing a database at all.

2. `MassBalanceEngine`, a thin orchestration layer that pulls the right
   numbers out of a SQLAlchemy session, calls the pure functions, and
   persists + logs the result.

A note on the formula as given: `B = (A + a) * CF + b` is the structure
you specified. I haven't independently verified this against the current
published ISCC EU/PLUS System Documents clause-by-clause -- mass balance
formulas of this shape are standard in EU biofuel sustainability schemes,
but exact variable definitions can differ slightly between scheme versions
and national implementations. Treat the implementation below as correct
*given your formula*, and have your auditor confirm the formula itself
still matches the current System Document before you rely on it.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from decimal import Decimal
from enum import Enum
from typing import Iterable, List, Optional, Sequence

from sqlalchemy.orm import Session

from models import (
    AuditLogEntry,
    Batch,
    BatchMerge,
    CertScheme,
    Period,
    PeriodBalance,
    PeriodStatus,
    PhysicalStockReading,
    ProductType,
    Site,
    Transaction,
    TransactionType,
)

TOLERANCE_PCT = Decimal("0.5")  # Rule 8


# ---------------------------------------------------------------------------
# Exceptions -- each maps 1:1 to a business rule that must hard-fail
# ---------------------------------------------------------------------------

class MassBalanceError(Exception):
    """Base class for all hard-stop violations in this module."""


class NegativeBalanceError(MassBalanceError):
    """Rule 5: C > B at period end. This must never be allowed to post."""


class PeriodContinuityError(MassBalanceError):
    """Rule 2: a new period does not start immediately after the previous
    period's end_date, or skips a site's chain entirely."""


class PhysicalLinkMissingError(MassBalanceError):
    """Rule 3: an INBOUND transaction has no weighbridge ticket / delivery
    note attached."""


class MultiSiteBalancingDisabledError(MassBalanceError):
    """Rule 1: an operation tried to pool batches or balances across more
    than one site while the site's multi_site_balancing_enabled flag is
    False."""


# ---------------------------------------------------------------------------
# Alerts -- soft warnings, surfaced to the user but not blocking
# ---------------------------------------------------------------------------

class AlertSeverity(str, Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


@dataclass
class Alert:
    code: str
    severity: AlertSeverity
    message: str


# ---------------------------------------------------------------------------
# Pure calculation layer
# ---------------------------------------------------------------------------

@dataclass
class PeriodBalanceResult:
    """Everything needed to persist a PeriodBalance row, plus the alerts
    raised while computing it."""

    incoming_a: Decimal
    opening_input_inventory_a: Decimal
    conversion_factor_cf: Decimal
    opening_output_inventory_b: Decimal
    total_available_B: Decimal
    outgoing_C: Decimal
    closing_balance: Decimal
    credits_carried_forward: Decimal
    ghg_value_assigned: Decimal
    alerts: List[Alert] = field(default_factory=list)


def calculate_total_available(
    incoming_a: Decimal,
    opening_input_inventory_a: Decimal,
    conversion_factor_cf: Decimal,
    opening_output_inventory_b: Decimal,
) -> Decimal:
    """B = (A + a) * CF + b"""
    return (incoming_a + opening_input_inventory_a) * conversion_factor_cf + opening_output_inventory_b


def enforce_no_negative_balance(total_available_B: Decimal, outgoing_C: Decimal) -> Decimal:
    """Rule 5. Hard exception if C > B. Returns the closing balance (B - C)
    if the check passes -- callers should not compute B - C themselves,
    to guarantee this check can never be silently skipped."""
    if outgoing_C > total_available_B:
        raise NegativeBalanceError(
            f"Outgoing volume ({outgoing_C}) exceeds total available sustainable "
            f"material ({total_available_B}) at period end. Deficit: "
            f"{outgoing_C - total_available_B}."
        )
    return total_available_B - outgoing_C


def assign_merged_ghg_value(source_ghg_values: Sequence[Decimal]) -> Decimal:
    """Rule 7: merged batches take the MAX (worst) GHG value of their
    sources -- never a volume-weighted average."""
    if not source_ghg_values:
        raise ValueError("Cannot merge a batch with no source GHG values.")
    return max(source_ghg_values)


def calculate_credit_carry_forward(
    cert_scheme: CertScheme,
    closing_balance: Decimal,
    physical_stock_total: Optional[Decimal],
) -> tuple[Decimal, List[Alert]]:
    """Rule 6.

    ISCC EU: capped at the site's total physical stock (certified + fossil).
    ISCC PLUS: uncapped -- carries forward in full regardless of physical
    stock on hand.

    Returns (carry_forward_amount, alerts).
    """
    alerts: List[Alert] = []

    if closing_balance <= 0:
        return Decimal("0"), alerts

    if cert_scheme == CertScheme.ISCC_PLUS:
        return closing_balance, alerts

    # ISCC_EU
    if physical_stock_total is None:
        alerts.append(Alert(
            code="EU_NO_PHYSICAL_STOCK_READING",
            severity=AlertSeverity.CRITICAL,
            message=(
                "ISCC EU site has no physical stock reading for this period end. "
                "Credit carry-forward cannot be validated against physical stock "
                "and has been set to 0 pending a stocktake."
            ),
        ))
        return Decimal("0"), alerts

    if closing_balance > physical_stock_total:
        capped = physical_stock_total
        alerts.append(Alert(
            code="EU_CARRY_FORWARD_CAPPED",
            severity=AlertSeverity.WARNING,
            message=(
                f"ISCC EU physical stock requirement not met for full credit "
                f"carry-forward: booked closing balance ({closing_balance}) exceeds "
                f"physical stock on site ({physical_stock_total}). Carry-forward "
                f"capped at {capped}; the remaining {closing_balance - capped} "
                f"cannot be carried forward under ISCC EU."
            ),
        ))
        return capped, alerts

    return closing_balance, alerts


def check_stock_tolerance(booked_stock: Decimal, physical_stock: Decimal) -> Optional[Alert]:
    """Rule 8: a 0.5% variance between booked and physical stock is allowed
    without an audit alert. Returns an Alert if the variance exceeds that,
    otherwise None."""
    if booked_stock == 0:
        if physical_stock == 0:
            return None
        variance_pct = Decimal("100")
    else:
        variance_pct = abs(booked_stock - physical_stock) / abs(booked_stock) * Decimal("100")

    if variance_pct > TOLERANCE_PCT:
        return Alert(
            code="STOCK_TOLERANCE_BREACH",
            severity=AlertSeverity.WARNING,
            message=(
                f"Booked stock ({booked_stock}) vs. physical stock ({physical_stock}) "
                f"differ by {variance_pct:.3f}%, exceeding the {TOLERANCE_PCT}% tolerance. "
                f"Flagged for audit review."
            ),
        )
    return None


def compute_period_balance(
    incoming_a: Decimal,
    opening_input_inventory_a: Decimal,
    conversion_factor_cf: Decimal,
    opening_output_inventory_b: Decimal,
    outgoing_C: Decimal,
    cert_scheme: CertScheme,
    ghg_value_assigned: Decimal,
    physical_stock_total: Optional[Decimal],
) -> PeriodBalanceResult:
    """End-to-end pure calculation for one (period, product_type): computes
    B, enforces the no-negative-balance rule, and derives the carry-forward
    amount. Raises NegativeBalanceError if C > B -- this function will not
    return a result that violates Rule 5."""

    alerts: List[Alert] = []

    total_available_B = calculate_total_available(
        incoming_a, opening_input_inventory_a, conversion_factor_cf, opening_output_inventory_b
    )

    # Rule 5 -- hard stop, not a soft alert. Deliberately not caught here;
    # it propagates to the caller so a period cannot be closed over it.
    closing_balance = enforce_no_negative_balance(total_available_B, outgoing_C)

    if outgoing_C > total_available_B * Decimal("0.95"):
        # Soft early-warning well before the hard failure threshold, useful
        # mid-period before the period actually closes.
        alerts.append(Alert(
            code="SALES_NEAR_AVAILABLE_LIMIT",
            severity=AlertSeverity.WARNING,
            message=(
                f"Sales ({outgoing_C}) are approaching available credits ({total_available_B}) "
                f"for this period. Remaining headroom: {total_available_B - outgoing_C}."
            ),
        ))

    carry_forward, cf_alerts = calculate_credit_carry_forward(
        cert_scheme, closing_balance, physical_stock_total
    )
    alerts.extend(cf_alerts)

    if physical_stock_total is not None:
        tolerance_alert = check_stock_tolerance(closing_balance, physical_stock_total)
        if tolerance_alert:
            alerts.append(tolerance_alert)

    return PeriodBalanceResult(
        incoming_a=incoming_a,
        opening_input_inventory_a=opening_input_inventory_a,
        conversion_factor_cf=conversion_factor_cf,
        opening_output_inventory_b=opening_output_inventory_b,
        total_available_B=total_available_B,
        outgoing_C=outgoing_C,
        closing_balance=closing_balance,
        credits_carried_forward=carry_forward,
        ghg_value_assigned=ghg_value_assigned,
        alerts=alerts,
    )


# ---------------------------------------------------------------------------
# Orchestration layer -- talks to the database
# ---------------------------------------------------------------------------

class MassBalanceEngine:
    def __init__(self, session: Session):
        self.session = session

    # -- Rule 2: period continuity -----------------------------------------

    def open_new_period(
        self, site: Site, start_date: dt.date, end_date: dt.date, actor: str
    ) -> Period:
        last_period = (
            self.session.query(Period)
            .filter(Period.site_id == site.id)
            .order_by(Period.end_date.desc())
            .first()
        )

        if last_period is not None:
            expected_start = last_period.end_date + dt.timedelta(days=1)
            if start_date != expected_start:
                raise PeriodContinuityError(
                    f"New period must start on {expected_start} (the day after the "
                    f"previous period ended on {last_period.end_date}); got {start_date}. "
                    f"Mass balance periods must be continuous with no gaps."
                )
            if last_period.status != PeriodStatus.CLOSED:
                raise PeriodContinuityError(
                    f"Previous period {last_period.id} is still OPEN. Close it before "
                    f"opening a new one."
                )

        period = Period(
            site_id=site.id,
            start_date=start_date,
            end_date=end_date,
            status=PeriodStatus.OPEN,
            previous_period_id=last_period.id if last_period else None,
        )
        self.session.add(period)
        self.session.flush()

        self._log(
            entity_type="Period", entity_id=period.id, action="OPEN", actor=actor,
            notes=f"Opened period {start_date} to {end_date} for site {site.id}.",
        )
        return period

    # -- Rule 3: physical link ----------------------------------------------

    def record_inbound_transaction(self, transaction: Transaction, actor: str) -> Transaction:
        if transaction.transaction_type == TransactionType.INBOUND and not transaction.physical_document_id:
            raise PhysicalLinkMissingError(
                "Inbound transactions must reference a weighbridge ticket or delivery "
                "note (physical_document_id) before a sustainability credit can be booked."
            )
        self.session.add(transaction)
        self.session.flush()
        self._log(
            entity_type="Transaction", entity_id=transaction.id, action="CREATE", actor=actor,
            after_value=f"type={transaction.transaction_type}, volume={transaction.volume}",
        )
        return transaction

    # -- Rule 7: GHG on merge ------------------------------------------------

    def merge_batches(self, batches: Sequence[Batch], actor: str) -> Batch:
        if len({b.site_id for b in batches}) > 1:
            site_ids = {b.site_id for b in batches}
            sites = self.session.query(Site).filter(Site.id.in_(site_ids)).all()
            if not all(s.multi_site_balancing_enabled for s in sites):
                raise MultiSiteBalancingDisabledError(
                    "Cannot merge batches from different sites: multi-site balancing "
                    "is disabled for at least one of the sites involved."
                )
        if len({(b.raw_material, b.country_of_origin, b.cert_scheme, b.product_type) for b in batches}) > 1:
            raise MassBalanceError(
                "Only batches sharing raw material, country of origin, certification "
                "scheme, and product type may be merged into one pool."
            )

        merged_ghg = assign_merged_ghg_value([b.ghg_value for b in batches])

        merged = Batch(
            site_id=batches[0].site_id,
            cert_scheme=batches[0].cert_scheme,
            raw_material=batches[0].raw_material,
            country_of_origin=batches[0].country_of_origin,
            ghg_value=merged_ghg,
            product_type=batches[0].product_type,
            is_merged=True,
        )
        self.session.add(merged)
        self.session.flush()

        for b in batches:
            volume = self._batch_current_volume(b)
            self.session.add(BatchMerge(
                result_batch_id=merged.id,
                source_batch_id=b.id,
                contributed_volume=volume,
                source_ghg_value=b.ghg_value,
            ))

        self._log(
            entity_type="Batch", entity_id=merged.id, action="MERGE", actor=actor,
            before_value=str([{"batch": b.id, "ghg": str(b.ghg_value)} for b in batches]),
            after_value=f"merged_ghg={merged_ghg} (max of sources, not averaged)",
        )
        return merged

    # -- Rule 5 + full period close ------------------------------------------

    def close_period(
        self,
        period: Period,
        product_type: ProductType,
        opening_input_inventory_a: Decimal,
        conversion_factor_cf: Decimal,
        opening_output_inventory_b: Decimal,
        ghg_value_assigned: Decimal,
        actor: str,
    ) -> PeriodBalanceResult:
        incoming_a = self._sum_transactions(
            period, product_type, (TransactionType.INBOUND, TransactionType.CONVERSION_IN)
        )
        outgoing_C = self._sum_transactions(
            period, product_type, (TransactionType.OUTBOUND, TransactionType.CONVERSION_OUT)
        )

        site = period.site
        physical_stock_total = self._latest_physical_stock_total(site, period.end_date)

        # Rule 5 is enforced inside compute_period_balance and will raise
        # before anything below executes if C > B.
        result = compute_period_balance(
            incoming_a=incoming_a,
            opening_input_inventory_a=opening_input_inventory_a,
            conversion_factor_cf=conversion_factor_cf,
            opening_output_inventory_b=opening_output_inventory_b,
            outgoing_C=outgoing_C,
            cert_scheme=site.cert_scheme,
            ghg_value_assigned=ghg_value_assigned,
            physical_stock_total=physical_stock_total,
        )

        balance_row = PeriodBalance(
            period_id=period.id,
            product_type=product_type,
            incoming_a=result.incoming_a,
            opening_input_inventory_a=result.opening_input_inventory_a,
            conversion_factor_cf=result.conversion_factor_cf,
            opening_output_inventory_b=result.opening_output_inventory_b,
            total_available_B=result.total_available_B,
            outgoing_C=result.outgoing_C,
            closing_balance=result.closing_balance,
            credits_carried_forward=result.credits_carried_forward,
            ghg_value_assigned=result.ghg_value_assigned,
        )
        self.session.add(balance_row)

        period.status = PeriodStatus.CLOSED
        period.closed_at = dt.datetime.utcnow()
        period.closed_by = actor
        self.session.flush()

        self._log(
            entity_type="Period", entity_id=period.id, action="CLOSE", actor=actor,
            after_value=(
                f"product={product_type}, B={result.total_available_B}, "
                f"C={result.outgoing_C}, closing={result.closing_balance}, "
                f"carry_forward={result.credits_carried_forward}"
            ),
            notes="; ".join(a.message for a in result.alerts) if result.alerts else None,
        )
        return result

    # -- helpers --------------------------------------------------------------

    def _sum_transactions(
        self, period: Period, product_type: ProductType, types: Iterable[TransactionType]
    ) -> Decimal:
        rows = (
            self.session.query(Transaction)
            .join(Batch, Transaction.batch_id == Batch.id)
            .filter(
                Transaction.period_id == period.id,
                Batch.product_type == product_type,
                Transaction.transaction_type.in_(list(types)),
            )
            .all()
        )
        total = sum((t.volume for t in rows), Decimal("0"))
        return total

    def _latest_physical_stock_total(self, site: Site, as_of: dt.date) -> Optional[Decimal]:
        reading = (
            self.session.query(PhysicalStockReading)
            .filter(PhysicalStockReading.site_id == site.id, PhysicalStockReading.reading_date <= as_of)
            .order_by(PhysicalStockReading.reading_date.desc())
            .first()
        )
        return reading.total_stock_qty if reading else None

    def _batch_current_volume(self, batch: Batch) -> Decimal:
        rows = self.session.query(Transaction).filter(Transaction.batch_id == batch.id).all()
        volume = Decimal("0")
        for t in rows:
            if t.transaction_type in (TransactionType.INBOUND, TransactionType.CONVERSION_IN):
                volume += t.volume
            else:
                volume -= t.volume
        return volume

    def _log(
        self,
        entity_type: str,
        entity_id: int,
        action: str,
        actor: str,
        before_value: Optional[str] = None,
        after_value: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> None:
        self.session.add(AuditLogEntry(
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            actor=actor,
            before_value=before_value,
            after_value=after_value,
            notes=notes,
        ))
