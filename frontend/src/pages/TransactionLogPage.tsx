import React, { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Transaction } from "../api/types";
import { Loading, EmptyState, PageHeader } from "../components/Ui";
import { fmt, fmtDate } from "../lib/format";

const typeTag: Record<string, string> = {
  INBOUND: "tag-in",
  OUTBOUND: "tag-out",
  CONVERSION_IN: "tag-conv",
  CONVERSION_OUT: "tag-conv",
};

type SortKey = 'date' | 'type' | 'site' | 'product' | 'feedstock' | 'ghg' | 'volume' | 'counterparty' | 'document' | 'recordedBy';

export function TransactionLogPage() {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [filterSearch, setFilterSearch] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [filterProduct, setFilterProduct] = useState('All');
  const [filterSite, setFilterSite] = useState('All');

  useEffect(() => {
    api.get<Transaction[]>("/transactions").then((res) => setTransactions(res.data));
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const getSortVal = (t: Transaction, key: SortKey): string | number => {
    switch (key) {
      case 'date': return t.transactionDate || '';
      case 'type': return t.transactionType || '';
      case 'site': return t.site?.name || '';
      case 'product': return t.batch?.productType || '';
      case 'feedstock': return t.batch?.rawMaterial || '';
      case 'ghg': return t.batch?.ghgValue || 0;
      case 'volume': return t.volume || 0;
      case 'counterparty': return t.counterpartyName || '';
      case 'document': return t.physicalDocument?.documentNumber || '';
      case 'recordedBy': return t.createdBy?.name || '';
      default: return '';
    }
  };

  const clearFilters = () => {
    setFilterSearch('');
    setFilterType('All');
    setFilterProduct('All');
    setFilterSite('All');
  };

  const uniqueSites = Array.from(new Set(transactions?.map(t => t.site?.name).filter(Boolean))) as string[];

  const filteredTransactions = transactions?.filter(t => {
    if (filterType !== 'All' && t.transactionType !== filterType) return false;
    if (filterProduct !== 'All' && t.batch?.productType !== filterProduct) return false;
    if (filterSite !== 'All' && t.site?.name !== filterSite) return false;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      const match = 
        t.counterpartyName?.toLowerCase().includes(q) ||
        t.physicalDocument?.documentNumber?.toLowerCase().includes(q) ||
        t.site?.name?.toLowerCase().includes(q) ||
        t.batch?.rawMaterial?.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const sortedTransactions = filteredTransactions ? [...filteredTransactions].sort((a, b) => {
    const valA = getSortVal(a, sortKey);
    const valB = getSortVal(b, sortKey);
    if (valA < valB) return sortDir === 'asc' ? -1 : 1;
    if (valA > valB) return sortDir === 'asc' ? 1 : -1;
    return 0;
  }) : [];

  const SortHeader = ({ label, sKey, num }: { label: string, sKey: SortKey, num?: boolean }) => (
    <th className={num ? "num" : ""} style={{ cursor: "pointer", userSelect: "none" }} onClick={() => handleSort(sKey)}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: num ? "flex-end" : "flex-start", color: sortKey === sKey ? 'var(--brand)' : 'inherit' }}>
        {label}
        <span style={{ fontSize: 10, opacity: sortKey === sKey ? 1 : 0.2 }}>
          {sortKey === sKey ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </div>
    </th>
  );

  return (
    <div>
      <PageHeader title="Transaction Log" subtitle="Every posted transaction, newest first. Nothing here can be edited or deleted once saved." />

      {!transactions ? (
        <Loading />
      ) : transactions.length === 0 ? (
        <EmptyState title="No transactions logged" sub="Transactions you record will appear here." />
      ) : (
        <>
          <div className="log-filter-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
            <div className="log-filter-row">
              <input type="text" className="log-filter-item search" placeholder="Search..." value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} />
              
              <select className="log-filter-item select" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="All">Type: All</option>
                <option value="INBOUND">Inbound</option>
                <option value="OUTBOUND">Outbound</option>
                <option value="CONVERSION_IN">Conversion In</option>
                <option value="CONVERSION_OUT">Conversion Out</option>
              </select>

              <select className="log-filter-item select" value={filterProduct} onChange={(e) => setFilterProduct(e.target.value)}>
                <option value="All">Product: All</option>
                <option value="BIOMETHANE">Biomethane</option>
                <option value="BIOLNG">Bio-LNG</option>
              </select>

              <select className="log-filter-item select" value={filterSite} onChange={(e) => setFilterSite(e.target.value)}>
                <option value="All">Site: All</option>
                {uniqueSites.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <button className="log-filter-clear" onClick={clearFilters}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
              Clear All Filters
            </button>
          </div>

          <div className="panel">
            <div className="panel-sub">{filteredTransactions?.length} transaction(s) found</div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <SortHeader label="Date" sKey="date" />
                  <SortHeader label="Type" sKey="type" />
                  <SortHeader label="Site" sKey="site" />
                  <SortHeader label="Product" sKey="product" />
                  <SortHeader label="Feedstock / Origin" sKey="feedstock" />
                  <SortHeader label="GHG" sKey="ghg" num />
                  <SortHeader label="Volume" sKey="volume" num />
                  <SortHeader label="Counterparty" sKey="counterparty" />
                  <SortHeader label="Document" sKey="document" />
                  <SortHeader label="Recorded by" sKey="recordedBy" />
                </tr>
              </thead>
              <tbody>
                {sortedTransactions.map((t) => (
                  <tr key={t.id}>
                    <td>{fmtDate(t.transactionDate)}</td>
                    <td className={typeTag[t.transactionType]}>{t.transactionType.replace("_", " ")}</td>
                    <td>{t.site?.name}</td>
                    <td>{t.batch?.productType}</td>
                    <td>
                      {t.batch?.rawMaterial} / {t.batch?.countryOfOrigin}
                    </td>
                    <td className="num">{t.batch?.ghgValue}</td>
                    <td className="num">{fmt(t.volume)}</td>
                    <td>{t.counterpartyName || "—"}</td>
                    <td>{t.physicalDocument ? t.physicalDocument.documentNumber : "—"}</td>
                    <td>{t.createdBy?.name || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
