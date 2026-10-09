// A slip check's answer: what the slip pays against fair, its EV, and each pick's fair price,
// every price in the three formats books print (American, multiple, percent).
import { StyleSheet, Text, View } from "react-native";

import { evText, type SlipCheckView } from "../../api/slipCheck";
import { palette } from "../../theme";

function PriceRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <View style={styles.priceRow}>
      <Text style={styles.priceLabel}>{label}</Text>
      <Text style={styles.priceValue}>{value}</Text>
    </View>
  );
}

function verdict(evPct: number): string {
  return evPct >= 0 ? `Better than fair: ${evText(evPct)} EV` : `Worse than fair: ${evText(evPct)} EV`;
}

export function SlipCheckCard({ check }: { check: SlipCheckView }) {
  return (
    <View style={styles.stack}>
      <Text style={styles.eyebrow}>{`SLIP CHECK · ${check.book.toUpperCase()}`}</Text>
      <Text style={styles.title}>{check.title}</Text>

      <View style={styles.block}>
        <PriceRow label="Slip pays" value={check.bookPays} />
        <PriceRow label="Fair" value={check.fair} />
        {check.evPct != null ? (
          <View style={[styles.verdict, { backgroundColor: check.evPct >= 0 ? palette.lime : palette.softPanel }]}>
            <Text style={styles.verdictText}>{verdict(check.evPct)}</Text>
          </View>
        ) : null}
        {check.withoutPromo ? (
          <Text style={styles.detail}>
            {`Without the promo: pays ${check.withoutPromo.bookPays ?? "—"}, ${evText(check.withoutPromo.evPct)} EV.`}
          </Text>
        ) : null}
        {check.perHundred && check.evPct != null ? (
          <Text style={styles.detail}>No amount on the slip, so EV is per $100.</Text>
        ) : null}
      </View>

      <View style={styles.legs}>
        <Text style={styles.sectionHeader}>PICKS</Text>
        {check.legs.map((leg, index) => (
          <View key={`${leg.label}-${index}`} style={styles.leg}>
            <Text style={styles.legLabel}>{leg.label}</Text>
            {leg.fair ? <Text style={styles.detail}>{`Fair ${leg.fair}`}</Text> : null}
            {leg.book ? <Text style={styles.detail}>{`Slip ${leg.book}`}</Text> : null}
            {leg.note ? <Text style={styles.detail}>{leg.note}</Text> : null}
          </View>
        ))}
      </View>

      {check.warnings.map((warning) => (
        <Text key={warning} style={styles.warning}>
          {warning}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  eyebrow: { fontSize: 11, fontWeight: "900", color: palette.mutedInk },
  title: { fontSize: 20, fontWeight: "600", color: palette.ink },
  block: {
    gap: 8,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: palette.panel,
    borderColor: "rgba(209, 242, 79, 0.45)", // palette.lime
  },
  priceRow: { gap: 2 },
  priceLabel: { fontSize: 11, fontWeight: "800", color: palette.mutedInk },
  priceValue: { fontSize: 17, fontWeight: "700", color: palette.ink },
  verdict: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  verdictText: { fontSize: 13, fontWeight: "800", color: palette.ink },
  detail: { fontSize: 13, fontWeight: "500", color: palette.mutedInk, lineHeight: 18 },
  legs: { gap: 10 },
  sectionHeader: { fontSize: 12, fontWeight: "900", color: palette.mutedInk },
  leg: { gap: 2 },
  legLabel: { fontSize: 15, fontWeight: "600", color: palette.ink },
  warning: { fontSize: 13, fontWeight: "500", color: palette.mutedInk, fontStyle: "italic" },
});
