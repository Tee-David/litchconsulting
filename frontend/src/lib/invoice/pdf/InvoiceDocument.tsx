import { Document, Page, View, Text, StyleSheet, Link } from "@react-pdf/renderer";
import { computeTotals, formatMoney } from "@/lib/invoice/money";
import { issuer } from "@/lib/invoice/issuer";
import type { InvoiceData } from "@/lib/invoice/types";

const BRAND = "#0a196d";
const INK = "#0a0e1a";
const BODY = "#5b6474";
const HAIR = "#e6e8f0";
const TINT = "#eef1fb";

const s = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 56, paddingHorizontal: 44, fontSize: 9.5, color: INK, fontFamily: "Helvetica" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brand: { fontSize: 16, fontFamily: "Helvetica-Bold", color: BRAND },
  issuerMeta: { color: BODY, marginTop: 4, lineHeight: 1.4 },
  invoiceTitle: { fontSize: 30, fontFamily: "Helvetica-Bold", letterSpacing: 1, color: INK },
  rule: { height: 3, backgroundColor: BRAND, width: 70, marginTop: 6, marginLeft: "auto" },
  metaGrid: { flexDirection: "row", gap: 28, marginTop: 26 },
  metaLabel: { color: BODY, fontSize: 7.5, letterSpacing: 0.8, textTransform: "uppercase" },
  metaValue: { fontFamily: "Helvetica-Bold", marginTop: 3, fontSize: 10 },
  billBlock: { marginTop: 26 },
  th: { flexDirection: "row", backgroundColor: TINT, paddingVertical: 7, paddingHorizontal: 8, marginTop: 6, borderRadius: 3 },
  thText: { color: BRAND, fontFamily: "Helvetica-Bold", fontSize: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  tr: { flexDirection: "row", paddingVertical: 8, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: HAIR },
  cDesc: { flex: 4 },
  cQty: { flex: 1, textAlign: "right" },
  cRate: { flex: 1.6, textAlign: "right" },
  cTax: { flex: 1, textAlign: "right" },
  cAmt: { flex: 1.6, textAlign: "right" },
  itemName: { fontFamily: "Helvetica-Bold" },
  itemDetail: { color: BODY, marginTop: 2, fontSize: 8.5 },
  totals: { marginTop: 14, marginLeft: "auto", width: 240 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  grandRow: { flexDirection: "row", justifyContent: "space-between", backgroundColor: BRAND, color: "#fff", paddingVertical: 9, paddingHorizontal: 10, borderRadius: 3, marginTop: 6 },
  grandText: { color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 11 },
  payBtn: { marginTop: 18, backgroundColor: BRAND, color: "#fff", paddingVertical: 9, paddingHorizontal: 18, borderRadius: 20, alignSelf: "flex-start", textDecoration: "none" },
  section: { marginTop: 22 },
  sectionLabel: { fontFamily: "Helvetica-Bold", fontSize: 9, marginBottom: 4 },
  footer: { position: "absolute", bottom: 26, left: 44, right: 44, borderTopWidth: 1, borderTopColor: HAIR, paddingTop: 8, color: BODY, fontSize: 8, flexDirection: "row", justifyContent: "space-between" },
});

export function InvoiceDocument({ data }: { data: InvoiceData }) {
  const totals = computeTotals(data.items);
  const cur = data.currency;
  const fmt = (n: number) => formatMoney(n, cur);

  return (
    <Document title={`Invoice ${data.number}`} author={issuer.name}>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.rowBetween}>
          <View>
            <Text style={s.brand}>{issuer.name}</Text>
            <Text style={s.issuerMeta}>{issuer.address}</Text>
            <Text style={s.issuerMeta}>{issuer.email}</Text>
            <Text style={s.issuerMeta}>{issuer.phone}</Text>
          </View>
          <View>
            <Text style={s.invoiceTitle}>INVOICE</Text>
            <View style={s.rule} />
          </View>
        </View>

        {/* Meta */}
        <View style={s.metaGrid}>
          <View>
            <Text style={s.metaLabel}>Invoice No.</Text>
            <Text style={s.metaValue}>{data.number}</Text>
          </View>
          <View>
            <Text style={s.metaLabel}>Issued</Text>
            <Text style={s.metaValue}>{data.issueDate}</Text>
          </View>
          {data.dueDate ? (
            <View>
              <Text style={s.metaLabel}>Due</Text>
              <Text style={s.metaValue}>{data.dueDate}</Text>
            </View>
          ) : null}
          {data.projectTitle ? (
            <View>
              <Text style={s.metaLabel}>Project</Text>
              <Text style={s.metaValue}>{data.projectTitle}</Text>
            </View>
          ) : null}
        </View>

        {/* Bill to */}
        <View style={s.billBlock}>
          <Text style={s.metaLabel}>Bill to</Text>
          {data.billTo.company ? <Text style={[s.metaValue, { marginTop: 4 }]}>{data.billTo.company}</Text> : null}
          {data.billTo.name ? <Text style={{ marginTop: 2 }}>{data.billTo.name}</Text> : null}
          {data.billTo.address ? <Text style={{ marginTop: 2, color: BODY }}>{data.billTo.address}</Text> : null}
          {data.billTo.email ? <Text style={{ marginTop: 2, color: BODY }}>{data.billTo.email}</Text> : null}
          {data.billTo.taxId ? <Text style={{ marginTop: 2, color: BODY }}>Tax ID: {data.billTo.taxId}</Text> : null}
        </View>

        {/* Items */}
        <View style={s.th}>
          <Text style={[s.thText, s.cDesc]}>Description</Text>
          <Text style={[s.thText, s.cQty]}>Qty</Text>
          <Text style={[s.thText, s.cRate]}>Unit Price</Text>
          <Text style={[s.thText, s.cTax]}>Tax</Text>
          <Text style={[s.thText, s.cAmt]}>Amount</Text>
        </View>
        {data.items.map((it, i) => (
          <View style={s.tr} key={i}>
            <View style={s.cDesc}>
              <Text style={s.itemName}>{it.description || "—"}</Text>
              {it.detail ? <Text style={s.itemDetail}>{it.detail}</Text> : null}
            </View>
            <Text style={s.cQty}>{it.quantity}</Text>
            <Text style={s.cRate}>{fmt(it.unitPrice)}</Text>
            <Text style={s.cTax}>{it.taxRate}%</Text>
            <Text style={s.cAmt}>{fmt(totals.lines[i]?.amount ?? 0)}</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={s.totals}>
          <View style={s.totalRow}>
            <Text style={{ color: BODY }}>Subtotal</Text>
            <Text>{fmt(totals.subtotal)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={{ color: BODY }}>Tax</Text>
            <Text>{fmt(totals.taxTotal)}</Text>
          </View>
          <View style={s.grandRow}>
            <Text style={s.grandText}>Total Due ({cur})</Text>
            <Text style={s.grandText}>{fmt(totals.total)}</Text>
          </View>
        </View>

        {/* Pay button */}
        {data.paymentUrl ? (
          <Link src={data.paymentUrl} style={s.payBtn}>
            <Text style={{ color: "#fff", fontFamily: "Helvetica-Bold" }}>Pay this invoice</Text>
          </Link>
        ) : null}

        {/* Payment details + notes */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>Payment details</Text>
          <Text style={{ color: BODY }}>Bank: {issuer.bank.name}</Text>
          <Text style={{ color: BODY }}>Account name: {issuer.bank.accountName}</Text>
          <Text style={{ color: BODY }}>Account number: {issuer.bank.accountNumber}</Text>
        </View>
        {data.notes ? (
          <View style={s.section}>
            <Text style={s.sectionLabel}>Notes</Text>
            <Text style={{ color: BODY }}>{data.notes}</Text>
          </View>
        ) : null}
        {data.terms ? (
          <View style={s.section}>
            <Text style={{ color: BODY, fontSize: 8.5 }}>{data.terms}</Text>
          </View>
        ) : null}

        <View style={s.footer} fixed>
          <Text>{issuer.name}</Text>
          <Text>{issuer.website}</Text>
        </View>
      </Page>
    </Document>
  );
}
