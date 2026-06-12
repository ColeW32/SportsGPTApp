// Port of LegalView (ContentView.swift:1535-1641) — Terms of Service, Privacy Policy,
// Responsible Betting, and Third-Party Provider disclosures, presented as a sheet.

import type { ReactNode } from "react";
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { palette } from "../../theme";

interface LegalSheetProps {
  visible: boolean;
  onClose: () => void;
}

export default function LegalSheet({ visible, onClose }: LegalSheetProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button">
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.headerBlock}>
            <Text style={styles.title}>Terms & Privacy</Text>
            <Text style={styles.subtitle}>
              {"Please review these terms, privacy disclosures, and responsible betting notices before using SportsGPT."}
            </Text>
          </View>

          <LegalCard title="Terms of Service">
            <LegalParagraph>{"Effective date: April 8, 2026."}</LegalParagraph>
            <LegalParagraph>
              {"SportsGPT provides sports betting insights, AI summaries, and market context for informational purposes only. SportsGPT is not a sportsbook, does not accept wagers, does not guarantee outcomes, and should not be treated as financial, investment, or legal advice."}
            </LegalParagraph>
            <LegalParagraph>
              {"You must be 21+ and located in a jurisdiction where sports betting and related services are legal to use the app for betting-related research. You are solely responsible for complying with all local laws, platform rules, bookmaker requirements, and tax obligations."}
            </LegalParagraph>
            <LegalParagraph>
              {"Odds, expected value, best bets, arbitrage information, and other betting data may change quickly and may contain delays, errors, or omissions. SportsGPT, MoneyLine, and their providers are not responsible for losses, missed opportunities, or decisions you make based on app content."}
            </LegalParagraph>
            <LegalParagraph>
              {"Subscriptions, trials, renewals, billing, and entitlements will be managed through RevenueCat and the applicable app-store payment platform once those services are fully connected. Premium features may change over time."}
            </LegalParagraph>
          </LegalCard>

          <LegalCard title="Privacy Policy">
            <LegalParagraph>
              {"SportsGPT may process prompts, chat history, selected sportsbook preferences, subscription state, and basic app interaction data to operate the product and improve the user experience. If you use dictation, speech recognition permissions are handled through Apple frameworks on your device."}
            </LegalParagraph>
            <LegalParagraph>
              {"We use third-party service providers to power parts of the app. MoneyLineApp.com provides betting-related data and AI context used in SportsGPT responses. RevenueCat provides subscription, entitlement, and purchase infrastructure when billing is enabled."}
            </LegalParagraph>
            <LegalParagraph>
              {"Information may be shared with these providers only as needed to deliver their services, including request contents, subscription state, purchase information, and technical identifiers required for platform functionality. You should also review each provider’s own terms and privacy materials."}
            </LegalParagraph>
            <View style={styles.linksBlock}>
              <LegalLink title="MoneyLine Terms" url="https://www.moneylineapp.com/terms" />
              <LegalLink title="MoneyLine Privacy" url="https://www.moneylineapp.com/privacy" />
              <LegalLink
                title="RevenueCat Privacy Resources"
                url="https://www.revenuecat.com/docs/platform-resources/apple-platform-resources/apple-app-privacy"
              />
            </View>
          </LegalCard>

          <LegalCard title="Responsible Betting">
            <LegalParagraph>
              {"Bet responsibly. Never wager more than you can afford to lose, and do not treat betting promotions or model outputs as guaranteed profit."}
            </LegalParagraph>
            <LegalParagraph>
              {"Must be 21+. If you or someone you know has a gambling problem, call 1-800-GAMBLER. Additional state-specific resources may apply depending on where you are located."}
            </LegalParagraph>
          </LegalCard>

          <LegalCard title="Third-Party Providers">
            <LegalParagraph>
              {"MoneyLineApp.com is a third-party provider used for sports betting data and AI-grounded betting context. RevenueCat is a third-party provider used for subscription infrastructure and entitlement management."}
            </LegalParagraph>
            <LegalParagraph>
              {"Their products, policies, uptime, and data handling practices are outside SportsGPT’s direct control."}
            </LegalParagraph>
          </LegalCard>

          <Text style={styles.footnote}>
            {"This screen is a product-level legal disclosure and UX implementation, not law-firm-reviewed legal advice. You should have final terms and privacy language reviewed by your attorney before production launch."}
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

function LegalCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function LegalParagraph({ children }: { children: ReactNode }) {
  return <Text style={styles.paragraph}>{children}</Text>;
}

function LegalLink({ title, url }: { title: string; url: string }) {
  return (
    <Pressable onPress={() => void Linking.openURL(url)} accessibilityRole="link" hitSlop={4}>
      <Text style={styles.link}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  doneText: {
    fontSize: 15,
    fontWeight: "700",
    color: palette.ink,
  },
  content: {
    padding: 20,
    gap: 20,
  },
  headerBlock: {
    gap: 8,
  },
  title: {
    fontSize: 30,
    fontWeight: "900",
    color: palette.ink,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "500",
    color: palette.mutedInk,
    lineHeight: 20,
  },
  card: {
    padding: 18,
    borderRadius: 22,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 14,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: palette.mutedInk,
  },
  paragraph: {
    fontSize: 14,
    fontWeight: "500",
    color: palette.ink,
    lineHeight: 20,
  },
  linksBlock: {
    gap: 10,
  },
  link: {
    fontSize: 14,
    fontWeight: "900",
    color: palette.ink,
  },
  footnote: {
    fontSize: 12,
    fontWeight: "500",
    color: palette.mutedInk,
    lineHeight: 17,
  },
});
