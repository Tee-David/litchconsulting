import path from "node:path";
import { Document, Page, View, Text, StyleSheet, Link, Svg, Path, Font, Image } from "@react-pdf/renderer";
import { computeTotals, formatMoney } from "@/lib/invoice/money";
import { issuer as defaultIssuer, type Issuer } from "@/lib/invoice/issuer";
import type { InvoiceData } from "@/lib/invoice/types";

// Noto Sans supports the Naira (₦) and other currency glyphs that the built-in
// Helvetica lacks — so the PDF renders currency exactly like the on-screen preview.
const FONT_DIR = path.join(process.cwd(), "src/lib/invoice/pdf/fonts");
Font.register({
  family: "NotoSans",
  fonts: [
    { src: path.join(FONT_DIR, "NotoSans-Regular.ttf") },
    { src: path.join(FONT_DIR, "NotoSans-Bold.ttf"), fontWeight: 700 },
    { src: path.join(FONT_DIR, "NotoSans-Italic.ttf"), fontStyle: "italic" },
  ],
});

const BRAND = "#0a196d";

// Litch favicon path (from app/icon.svg) — used as a faint per-page watermark.
const MARK =
  "M 95.951 2.547 C 68.333 7.549, 41.129 24.428, 23.959 47.215 C 16.113 57.627, 7.603 75.050, 4.282 87.500 C 1.851 96.613, 1.610 99.186, 1.557 116.500 C 1.506 133.369, 1.764 136.498, 3.851 144.394 C 15.154 187.157, 46.858 218.893, 89.500 230.129 C 97.456 232.225, 100.705 232.500, 117.500 232.500 C 139.045 232.500, 146.845 231.051, 163.201 224.013 C 195.997 209.899, 221.603 180.491, 230.692 146.500 C 233.152 137.302, 233.368 134.937, 233.390 117 C 233.411 98.975, 233.212 96.761, 230.757 87.723 C 225.368 67.884, 215.080 50.093, 200.513 35.425 C 183.104 17.896, 161.711 6.595, 138.119 2.467 C 127.770 0.656, 106.166 0.697, 95.951 2.547 M 105 60.441 C 105 77.145, 104.619 88.117, 104.027 88.483 C 103.492 88.814, 102.575 90.865, 101.989 93.042 C 100.537 98.434, 102.266 104.466, 106.467 108.667 L 109.756 111.956 106.378 126.079 C 104.520 133.847, 103 140.382, 103 140.601 C 103 140.821, 117.850 141, 136 141 L 169 141 169 154.500 L 169 168 122.500 168 L 76 168 76 106 C 76 71.900, 75.720 44, 75.377 44 C 73.692 44, 61.802 53.505, 56.443 59.136 C 48.883 67.079, 44.720 73.141, 40.518 82.325 C 34.855 94.703, 33.492 101.702, 33.568 118 C 33.629 131.083, 33.909 133.331, 36.435 141 C 41.713 157.030, 48.350 167.481, 60.311 178.595 C 75.804 192.991, 92.260 199.772, 114.010 200.725 C 153.881 202.472, 188.225 177.298, 199.585 138 C 201.066 132.876, 201.453 128.326, 201.410 116.500 C 201.361 102.854, 201.104 100.733, 198.562 93 C 193.450 77.455, 187.193 67.288, 176.365 56.939 C 159.088 40.426, 140.644 33.021, 116.750 33.007 L 105 33 105 60.441 M 115 67 L 115 81 117.684 81 C 121.860 81, 128.261 84.617, 130.846 88.438 C 135.092 94.712, 133.498 105.103, 127.576 109.762 C 124.859 111.899, 124.735 110.470, 129.101 127.250 L 130.077 131 149.539 131 L 169 131 169 110.589 C 169 87.249, 168.047 82.429, 161.471 72.522 C 153.577 60.630, 137.792 53.069, 120.750 53.017 L 115 53 115 67";

const STATUS_STAMP: Record<string, { label: string; color: string }> = {
  paid: { label: "PAID", color: "#16a34a" },
  sent: { label: "UNPAID", color: "#d97706" },
  overdue: { label: "OVERDUE", color: "#dc2626" },
  draft: { label: "DRAFT", color: "#8a92a6" },
  void: { label: "VOID", color: "#8a92a6" },
  accepted: { label: "ACCEPTED", color: "#16a34a" },
  declined: { label: "DECLINED", color: "#dc2626" },
};
const INK = "#0a0e1a";
const BODY = "#5b6474";
const HAIR = "#e6e8f0";
const TINT = "#eef1fb";

const s = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 56, paddingHorizontal: 44, fontSize: 9.5, color: INK, fontFamily: "NotoSans" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brand: { fontSize: 16, fontFamily: "NotoSans", fontWeight: 700, color: BRAND },
  issuerMeta: { color: BODY, marginTop: 4, lineHeight: 1.4 },
  invoiceTitle: { fontSize: 30, fontFamily: "NotoSans", fontWeight: 700, letterSpacing: 1, color: INK },
  rule: { height: 3, backgroundColor: BRAND, width: 70, marginTop: 6, marginLeft: "auto" },
  metaGrid: { flexDirection: "row", gap: 28, marginTop: 26 },
  metaLabel: { color: BODY, fontSize: 7.5, letterSpacing: 0.8, textTransform: "uppercase" },
  metaValue: { fontFamily: "NotoSans", fontWeight: 700, marginTop: 3, fontSize: 10 },
  billBlock: { marginTop: 26 },
  th: { flexDirection: "row", backgroundColor: TINT, paddingVertical: 7, paddingHorizontal: 8, marginTop: 6, borderRadius: 3 },
  thText: { color: BRAND, fontFamily: "NotoSans", fontWeight: 700, fontSize: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  tr: { flexDirection: "row", paddingVertical: 8, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: HAIR },
  cDesc: { flex: 4 },
  cQty: { flex: 1, textAlign: "right" },
  cRate: { flex: 1.6, textAlign: "right" },
  cTax: { flex: 1, textAlign: "right" },
  cAmt: { flex: 1.6, textAlign: "right" },
  itemName: { fontFamily: "NotoSans", fontWeight: 700 },
  itemDetail: { color: BODY, marginTop: 2, fontSize: 8.5 },
  totals: { marginTop: 14, marginLeft: "auto", width: 240 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  grandRow: { flexDirection: "row", justifyContent: "space-between", backgroundColor: BRAND, color: "#fff", paddingVertical: 9, paddingHorizontal: 10, borderRadius: 3, marginTop: 6 },
  grandText: { color: "#fff", fontFamily: "NotoSans", fontWeight: 700, fontSize: 11 },
  payBtn: { marginTop: 18, backgroundColor: BRAND, color: "#fff", paddingVertical: 9, paddingHorizontal: 18, borderRadius: 20, alignSelf: "flex-start", textDecoration: "none" },
  section: { marginTop: 22 },
  sectionLabel: { fontFamily: "NotoSans", fontWeight: 700, fontSize: 9, marginBottom: 4 },
  footer: { position: "absolute", bottom: 26, left: 44, right: 44, borderTopWidth: 1, borderTopColor: HAIR, paddingTop: 8, color: BODY, fontSize: 8, flexDirection: "row", justifyContent: "space-between" },
});

export function InvoiceDocument({
  data,
  variant = "invoice",
  issuer = defaultIssuer,
  qrDataUrl,
}: {
  data: InvoiceData;
  variant?: "invoice" | "receipt" | "quote";
  issuer?: Issuer;
  qrDataUrl?: string;
}) {
  const isReceipt = variant === "receipt";
  const isQuote = variant === "quote";
  const docTitle = isQuote ? "QUOTE" : isReceipt ? "RECEIPT" : "INVOICE";
  const totals = computeTotals(data.items);
  const cur = data.currency;
  const fmt = (n: number) => formatMoney(n, cur);

  const stamp = STATUS_STAMP[data.status];

  return (
    <Document title={`${isQuote ? "Quote" : isReceipt ? "Receipt" : "Invoice"} ${data.number}`} author={issuer.name}>
      <Page size="A4" style={s.page}>
        {/* Favicon watermark on every page */}
        <View fixed style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
          {/* react-pdf rasterises fill/opacity unreliably, so use a solid faint
              tint (matches the preview's navy-at-~4.5% watermark) rather than opacity. */}
          <Svg width={330} height={330} viewBox="0 0 235 234">
            <Path d={MARK} fill="#f1f3fb" />
          </Svg>
        </View>

        {/* Status stamp */}
        {stamp ? (
          <View style={{ position: "absolute", top: 96, right: 44, borderWidth: 2, borderColor: stamp.color, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2, transform: "rotate(-12deg)" }}>
            <Text style={{ color: stamp.color, fontFamily: "NotoSans", fontWeight: 700, fontSize: 16, letterSpacing: 1, opacity: 0.75 }}>{stamp.label}</Text>
          </View>
        ) : null}

        {/* Header */}
        <View style={s.rowBetween}>
          <View>
            <Text style={s.brand}>{issuer.name}</Text>
            <Text style={s.issuerMeta}>{issuer.address}</Text>
            <Text style={s.issuerMeta}>{issuer.email}</Text>
            <Text style={s.issuerMeta}>{issuer.phone}</Text>
            {isReceipt ? (
              <Text style={{ marginTop: 8, color: "#16a34a", fontFamily: "NotoSans", fontWeight: 700 }}>PAID ✓</Text>
            ) : null}
          </View>
          <View>
            <Text style={s.invoiceTitle}>{docTitle}</Text>
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
            <Text style={s.grandText}>{isQuote ? "Total" : isReceipt ? "Total Paid" : "Total Due"} ({cur})</Text>
            <Text style={s.grandText}>{fmt(totals.total)}</Text>
          </View>
        </View>

        {/* Pay button (invoices only) */}
        {!isReceipt && !isQuote && data.paymentUrl ? (
          <Link src={data.paymentUrl} style={s.payBtn}>
            <Text style={{ color: "#fff", fontFamily: "NotoSans", fontWeight: 700 }}>Pay this invoice</Text>
          </Link>
        ) : null}

        {/* Payment details + notes */}
        {/* Signature */}
        <View style={{ marginTop: 26, alignItems: "flex-end" }}>
          <Text style={{ fontFamily: "NotoSans", fontStyle: "italic", fontSize: 15, color: INK }}>Litch Consulting</Text>
          <View style={{ width: 150, borderTopWidth: 1, borderTopColor: INK, marginTop: 4 }} />
          <Text style={{ color: BODY, fontSize: 8, marginTop: 3 }}>Authorised signatory</Text>
        </View>

        <View style={[s.section, { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }]}>
          <View>
          <Text style={s.sectionLabel}>Payment details</Text>
          <Text style={{ color: BODY }}>Bank: {issuer.bank.name}</Text>
          <Text style={{ color: BODY }}>Account name: {issuer.bank.accountName}</Text>
          <Text style={{ color: BODY }}>Account number: {issuer.bank.accountNumber}</Text>
          </View>
          {qrDataUrl ? (
            <View style={{ alignItems: "center" }}>
              <Image src={qrDataUrl} style={{ width: 62, height: 62 }} />
              <Text style={{ color: BODY, fontSize: 7, marginTop: 2 }}>{isReceipt ? "Scan to view" : "Scan to pay"}</Text>
            </View>
          ) : null}
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
