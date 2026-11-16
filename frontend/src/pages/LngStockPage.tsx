import React, { useEffect, useState } from "react";
import { api, apiErrorMessage } from "../api/client";
import type { LngLot, Site } from "../api/types";
import { useAuth } from "../context/AuthContext";
import { Loading, EmptyState, PageHeader } from "../components/Ui";
import { fmt, fmtDate } from "../lib/format";
import { UNIT_LABELS } from "../lib/constants";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * The shared physical (uncertified) LNG stock -- the client workbook's
 * "Physical LNG" ledger. Conventional LNG is held in one pool shared by EU and
 * PLUS: a liquefaction (Conversions, with tolling) deducts the LNG that goes
 * with the credit, and LNG that is sold is booked here as an outgoing. It is
 * never certified and never enters the EU/PLUS mass balance.
 */
export function LngStockPage() {
  const { canWrite } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [lots, setLots] = useState<LngLot[] | null>(null);

  // receipt form
  const [siteId, setSiteId] = useState<number | "">("");
  const [receiptDate, setReceiptDate] = useState(today());
  const [quantity, setQuantity] = useState("");
  const [reference, setReference] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [receiptError, setReceiptError] = useState("");
  const [receiptBusy, setReceiptBusy] = useState(false);

  // outgoing form
  const [outLotId, setOutLotId] = useState<number | "">("");
  const [outDate, setOutDate] = useState(today());
  const [outQuantity, setOutQuantity] = useState("");
  const [outReference, setOutReference] = useState("");
  const [customer, setCustomer] = useState("");
  const [outError, setOutError] = useState("");
  const [outBusy, setOutBusy] = useState(false);

  const [message, setMessage] = useState("");

  function load() {
    api.get<Site[]>("/sites").then((res) => setSites(res.data));
    api.get<LngLot[]>("/lng/lots").then((res) => setLots(res.data));
  }
  useEffect(load, []);

  async function handleReceipt(e: React.FormEvent) {
    e.preventDefault();
    setReceiptError("");
    setMessage("");
    setReceiptBusy(true);
    try {
      const res = await api.post<LngLot>("/lng/lots", {
        siteId,
        receiptDate,
        quantity: Number(quantity),
        reference: reference.trim(),
        supplierName: supplierName.trim() || undefined,
      });
      setMessage(`LNG receipt recorded as lot ${res.data.lotRef}.`);
      setQuantity("");
      setReference("");
      load();
    } catch (err) {
      setReceiptError(apiErrorMessage(err));
    } finally {
      setReceiptBusy(false);
    }
  }

  const outLot = lots?.find((l) => l.id === outLotId);

  async function handleOutgoing(e: React.FormEvent) {
    e.preventDefault();
    if (!outLot) return;
    setOutError("");
    setMessage("");
    setOutBusy(true);
    try {
      await api.post("/lng/outgoing", {
        siteId: outLot.siteId,
        lngLotId: outLot.id,
        quantity: Number(outQuantity),
        movementDate: outDate,
        reference: outReference.trim() || undefined,
        customer: customer.trim() || undefined,
      });
      setMessage(`Outgoing LNG of ${fmt(outQuantity)} ${UNIT_LABELS[outLot.unit]} recorded against ${outLot.lotRef}.`);
      setOutQuantity("");
      setOutReference("");
      load();
    } catch (err) {
      setOutError(apiErrorMessage(err));
    } finally {
      setOutBusy(false);
    }
  }

  const stocked = (lots ?? []).filter((l) => Number(l.remaining) > 0);

  return (
    <div>
      <PageHeader
        title="Physical LNG"
        subtitle="The shared pool of conventional (uncertified) LNG. Receipts go in here; each liquefaction deducts the LNG that goes with the credit (choose the lot under Conversions, with tolling); sales go out here. It is never certified and does not enter the EU or PLUS balance."
      />

      {message && <div className="alert-msg INFO">{message}</div>}

      {canWrite && (
        <>
          <form className="panel" onSubmit={handleReceipt}>
            <h2>LNG receipt</h2>
            <div className="form-grid">
              <div className="field">
                <label>Site</label>
                <select value={siteId} onChange={(e) => setSiteId(Number(e.target.value))} required>
                  <option value="">— select site —</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Receipt date</label>
                <input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} required />
              </div>
              <div className="field">
                <label>Quantity (MMBtu)</label>
                <input type="number" step="any" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
              </div>
              <div className="field">
                <label>Receipt reference</label>
                <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. LNG-SUPP-PEGT-2026-10" required />
              </div>
              <div className="field span2">
                <label>Supplier</label>
                <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
              </div>
            </div>
            {receiptError && <div className="error-msg">{receiptError}</div>}
            <div style={{ marginTop: 14 }}>
              <button className="btn" disabled={receiptBusy}>
                {receiptBusy ? "Saving…" : "Record receipt"}
              </button>
            </div>
          </form>

          <form className="panel" onSubmit={handleOutgoing}>
            <h2>LNG outgoing</h2>
            <div className="form-grid">
              <div className="field span2">
                <label>LNG lot</label>
                <select value={outLotId} onChange={(e) => setOutLotId(e.target.value ? Number(e.target.value) : "")} required>
                  <option value="">— choose a lot —</option>
                  {stocked.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.lotRef} — remaining {fmt(l.remaining)} {UNIT_LABELS[l.unit]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Date</label>
                <input type="date" value={outDate} onChange={(e) => setOutDate(e.target.value)} required />
              </div>
              <div className="field">
                <label>Quantity{outLot ? ` (${UNIT_LABELS[outLot.unit]})` : ""}</label>
                <input type="number" step="any" min="0" value={outQuantity} onChange={(e) => setOutQuantity(e.target.value)} required />
                {outLot && Number(outQuantity) > Number(outLot.remaining) && (
                  <div className="hint">More than the {fmt(outLot.remaining)} remaining in this lot — it would be rejected.</div>
                )}
              </div>
              <div className="field">
                <label>Delivery reference</label>
                <input value={outReference} onChange={(e) => setOutReference(e.target.value)} />
              </div>
              <div className="field">
                <label>Customer</label>
                <input value={customer} onChange={(e) => setCustomer(e.target.value)} />
              </div>
            </div>
            {outError && <div className="error-msg">{outError}</div>}
            <div style={{ marginTop: 14 }}>
              <button className="btn" disabled={outBusy}>
                {outBusy ? "Saving…" : "Record outgoing"}
              </button>
            </div>
          </form>
        </>
      )}

      {!lots ? (
        <Loading />
      ) : lots.length === 0 ? (
        <EmptyState title="No LNG lots yet" sub="Record a conventional LNG receipt above and it will appear here with its remaining balance." />
      ) : (
        <div className="panel">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Lot</th>
                  <th>Site</th>
                  <th>Received</th>
                  <th>Supplier</th>
                  <th className="num">Original</th>
                  <th className="num">Used in liquefaction</th>
                  <th className="num">Outgoing</th>
                  <th className="num">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {lots.map((l) => (
                  <tr key={l.id}>
                    <td>{l.lotRef}</td>
                    <td>{l.site?.name ?? `Site #${l.siteId}`}</td>
                    <td>{fmtDate(l.receiptDate)}</td>
                    <td>{l.supplierName ?? ""}</td>
                    <td className="num">
                      {fmt(l.quantity)} {UNIT_LABELS[l.unit]}
                    </td>
                    <td className="num">{fmt(l.deducted)}</td>
                    <td className="num">{fmt(l.outgoing)}</td>
                    <td className="num">{fmt(l.remaining)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
