"""
ISCC Mass Balance Bookkeeping Tool -- Database Schema
======================================================
SQLAlchemy 2.0 declarative models.

Design notes (why the schema looks the way it does):

- Rule 1 (site-specific boundaries): every balance-relevant row hangs off a
  `site_id`. `Site.multi_site_balancing_enabled` defaults to False, and the
  engine layer (mass_balance_engine.py) refuses to pool batches or run a
  calculation across more than one site unless that flag is explicitly on.

- Rule 2 (gap-free periods): `Period.previous_period_id` chains each period
  to the one before it. A single FK can't guarantee "no gaps" by itself
  (that's a date-continuity rule), so the chain is validated in code when a
  new period is opened -- see `MassBalanceEngine.open_new_period`.

- Rule 3 (physical link): `Transaction` has a CHECK constraint that any row
  with `transaction_type = 'INBOUND'` must carry a `physical_document_id`.
  `PhysicalDocument` models the weighbridge ticket / delivery note itself.

- Rule 6 (carry-forward cap): `PhysicalStockReading` is an independent,
  auditor-facing record of what's physically in the tank/silo, separate
  from anything derived from booked transactions. The engine compares
  booked stock against this table, never against itself.

- Rule 7 (GHG on merge): `BatchMerge` keeps a lineage row per source batch
  that fed into a merged batch, so "we assigned the MAX GHG value of X"
  is traceable back to which source batches were in play -- not just
  asserted in a log line.

- Audit trail: `AuditLogEntry` is intentionally dumb and append-only.
  Nothing in this schema updates or deletes rows in that table -- the
  engine layer only ever INSERTs into it.

This file defines structure only. All business-rule enforcement (no
negative balances, GHG max-not-average, EU vs PLUS carry-forward, the
0.5% tolerance, period continuity) lives in mass_balance_engine.py, not
here -- the schema should not be the only thing standing between bad data
and the database.
"""

from __future__ import annotations

import datetime as dt
import enum
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class CertScheme(str, enum.Enum):
    ISCC_EU = "ISCC_EU"
    ISCC_PLUS = "ISCC_PLUS"


class ProductType(str, enum.Enum):
    BIOMETHANE = "BIOMETHANE"
    BIOLNG = "BIOLNG"


class TransactionType(str, enum.Enum):
    INBOUND = "INBOUND"
    OUTBOUND = "OUTBOUND"
    CONVERSION_IN = "CONVERSION_IN"
    CONVERSION_OUT = "CONVERSION_OUT"


class PeriodStatus(str, enum.Enum):
    OPEN = "OPEN"
    CLOSED = "CLOSED"


# ---------------------------------------------------------------------------
# Core tables
# ---------------------------------------------------------------------------

class Site(Base):
    __tablename__ = "sites"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    location_id: Mapped[str] = mapped_column(String(100), unique=True)
    cert_scheme: Mapped[CertScheme] = mapped_column(SAEnum(CertScheme))
    # Rule 1: disabled by default -- must be explicitly opted into.
    multi_site_balancing_enabled: Mapped[bool] = mapped_column(default=False)
    default_period_length_months: Mapped[int] = mapped_column(Integer, default=3)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, server_default=func.now())

    periods: Mapped[List["Period"]] = relationship(back_populates="site")
    batches: Mapped[List["Batch"]] = relationship(back_populates="site")
    stock_readings: Mapped[List["PhysicalStockReading"]] = relationship(back_populates="site")


class Period(Base):
    __tablename__ = "periods"
    __table_args__ = (
        UniqueConstraint("site_id", "start_date", name="uq_period_site_start"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"))
    start_date: Mapped[dt.date]
    end_date: Mapped[dt.date]
    status: Mapped[PeriodStatus] = mapped_column(SAEnum(PeriodStatus), default=PeriodStatus.OPEN)
    # Rule 2: chain to the immediately preceding period; NULL only for a
    # site's very first period. Continuity (end_date+1 == next.start_date)
    # is checked in the engine, not here.
    previous_period_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("periods.id"), nullable=True
    )
    closed_at: Mapped[Optional[dt.datetime]] = mapped_column(DateTime, nullable=True)
    closed_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    site: Mapped["Site"] = relationship(back_populates="periods")
    previous_period: Mapped[Optional["Period"]] = relationship(remote_side=[id])
    transactions: Mapped[List["Transaction"]] = relationship(back_populates="period")
    balances: Mapped[List["PeriodBalance"]] = relationship(back_populates="period")


class PhysicalDocument(Base):
    """The weighbridge ticket / delivery note required before an inbound
    sustainability credit can be booked (Rule 3)."""

    __tablename__ = "physical_documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_type: Mapped[str] = mapped_column(String(50))  # WEIGHBRIDGE_TICKET / DELIVERY_NOTE
    document_number: Mapped[str] = mapped_column(String(100), unique=True)
    document_date: Mapped[dt.date]
    issued_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    file_reference: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    transactions: Mapped[List["Transaction"]] = relationship(back_populates="physical_document")


class Batch(Base):
    """A parcel of material carrying a fixed set of sustainability
    characteristics (feedstock, origin, GHG, scheme)."""

    __tablename__ = "batches"

    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"))
    cert_scheme: Mapped[CertScheme] = mapped_column(SAEnum(CertScheme))
    raw_material: Mapped[str] = mapped_column(String(150))
    country_of_origin: Mapped[str] = mapped_column(String(100))
    ghg_value: Mapped[Decimal] = mapped_column(Numeric(10, 4))  # gCO2eq/MJ
    product_type: Mapped[ProductType] = mapped_column(SAEnum(ProductType))
    is_merged: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, server_default=func.now())

    site: Mapped["Site"] = relationship(back_populates="batches")
    transactions: Mapped[List["Transaction"]] = relationship(back_populates="batch")


class BatchMerge(Base):
    """Lineage for a merged batch: which source batches contributed, and how
    much volume each contributed. Exists so 'GHG = MAX of sources' (Rule 7)
    is traceable, not just asserted."""

    __tablename__ = "batch_merges"

    id: Mapped[int] = mapped_column(primary_key=True)
    result_batch_id: Mapped[int] = mapped_column(ForeignKey("batches.id"))
    source_batch_id: Mapped[int] = mapped_column(ForeignKey("batches.id"))
    contributed_volume: Mapped[Decimal] = mapped_column(Numeric(18, 3))
    source_ghg_value: Mapped[Decimal] = mapped_column(Numeric(10, 4))

    result_batch: Mapped["Batch"] = relationship(foreign_keys=[result_batch_id])
    source_batch: Mapped["Batch"] = relationship(foreign_keys=[source_batch_id])


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        CheckConstraint(
            "(transaction_type != 'INBOUND') OR (physical_document_id IS NOT NULL)",
            name="ck_inbound_requires_physical_document",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"))
    period_id: Mapped[int] = mapped_column(ForeignKey("periods.id"))
    batch_id: Mapped[int] = mapped_column(ForeignKey("batches.id"))
    transaction_type: Mapped[TransactionType] = mapped_column(SAEnum(TransactionType))
    volume: Mapped[Decimal] = mapped_column(Numeric(18, 3))
    transaction_date: Mapped[dt.date]
    counterparty_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    counterparty_cert_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    # Rule 3: required for INBOUND, optional for other transaction types.
    physical_document_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("physical_documents.id"), nullable=True
    )
    created_at: Mapped[dt.datetime] = mapped_column(DateTime, server_default=func.now())
    created_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    site: Mapped["Site"] = relationship()
    period: Mapped["Period"] = relationship(back_populates="transactions")
    batch: Mapped["Batch"] = relationship(back_populates="transactions")
    physical_document: Mapped[Optional["PhysicalDocument"]] = relationship(
        back_populates="transactions"
    )


class PhysicalStockReading(Base):
    """Independent physical inventory reading (tank gauge, sensor feed, or
    manual stocktake). Used for the ISCC EU carry-forward cap and the 0.5%
    tolerance check (Rules 6 and 8). Deliberately not derived from booked
    transactions -- it's the reality check against them."""

    __tablename__ = "physical_stock_readings"

    id: Mapped[int] = mapped_column(primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"))
    reading_date: Mapped[dt.date]
    certified_stock_qty: Mapped[Decimal] = mapped_column(Numeric(18, 3))
    fossil_stock_qty: Mapped[Decimal] = mapped_column(Numeric(18, 3), default=Decimal("0"))
    source: Mapped[str] = mapped_column(String(50))  # SENSOR / MANUAL_STOCKTAKE
    recorded_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    site: Mapped["Site"] = relationship(back_populates="stock_readings")

    @property
    def total_stock_qty(self) -> Decimal:
        return self.certified_stock_qty + self.fossil_stock_qty


class PeriodBalance(Base):
    """One row per (period, product_type): the computed, closed-period
    result of the B formula. This is the auditable artifact -- every input
    to the formula is stored alongside the output, not just the final
    number."""

    __tablename__ = "period_balances"
    __table_args__ = (
        UniqueConstraint("period_id", "product_type", name="uq_balance_period_product"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    period_id: Mapped[int] = mapped_column(ForeignKey("periods.id"))
    product_type: Mapped[ProductType] = mapped_column(SAEnum(ProductType))

    incoming_a: Mapped[Decimal] = mapped_column(Numeric(18, 3))                  # A
    opening_input_inventory_a: Mapped[Decimal] = mapped_column(Numeric(18, 3))   # a
    conversion_factor_cf: Mapped[Decimal] = mapped_column(Numeric(10, 6))        # CF
    opening_output_inventory_b: Mapped[Decimal] = mapped_column(Numeric(18, 3))  # b
    total_available_B: Mapped[Decimal] = mapped_column(Numeric(18, 3))           # B
    outgoing_C: Mapped[Decimal] = mapped_column(Numeric(18, 3))                  # C
    closing_balance: Mapped[Decimal] = mapped_column(Numeric(18, 3))             # B - C
    credits_carried_forward: Mapped[Decimal] = mapped_column(Numeric(18, 3))
    ghg_value_assigned: Mapped[Decimal] = mapped_column(Numeric(10, 4))
    computed_at: Mapped[dt.datetime] = mapped_column(DateTime, server_default=func.now())

    period: Mapped["Period"] = relationship(back_populates="balances")


class AuditLogEntry(Base):
    """Append-only. Application code must only ever INSERT here -- never
    UPDATE or DELETE. See README section 4 for what must be logged."""

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(50))
    entity_id: Mapped[int] = mapped_column(Integer)
    action: Mapped[str] = mapped_column(String(50))
    actor: Mapped[str] = mapped_column(String(200))
    timestamp: Mapped[dt.datetime] = mapped_column(DateTime, server_default=func.now())
    before_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    after_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
