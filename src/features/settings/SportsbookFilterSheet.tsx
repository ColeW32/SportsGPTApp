// Port of SportsbookFilterSheet (ContentView.swift:3053-3175), presented as a
// full-screen cover (ContentView.swift:102-104). Selection applies immediately per
// toggle, exactly like the Swift binding-backed Set<Sportsbook>.

import { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SPORTSBOOKS } from "../../api/sportsbooks";
import { useChatStore } from "../../state/chatStore";
import { palette } from "../../theme";

interface SportsbookFilterSheetProps {
  visible: boolean;
  onClose: () => void;
}

export default function SportsbookFilterSheet({ visible, onClose }: SportsbookFilterSheetProps) {
  const insets = useSafeAreaInsets();
  const selectedIds = useChatStore((s) => s.selectedSportsbookIds);
  const setSelectedSportsbookIds = useChatStore((s) => s.setSelectedSportsbookIds);
  const [searchText, setSearchText] = useState("");

  const query = searchText.trim();
  const filteredSportsbooks =
    query.length === 0
      ? SPORTSBOOKS
      : SPORTSBOOKS.filter((book) => book.name.toLowerCase().includes(query.toLowerCase()));

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedSportsbookIds(selectedIds.filter((existing) => existing !== id));
    } else {
      setSelectedSportsbookIds([...selectedIds, id]);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button">
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.headerBlock}>
            <Text style={styles.title}>Sportsbooks</Text>
            <Text style={styles.subtitle}>
              {"Filter SportsGPT down to the books you actually use."}
            </Text>
          </View>

          <View style={styles.actionsRow}>
            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                selectedIds.length === 0 && styles.actionButtonEmphasized,
                pressed && styles.pressed,
              ]}
              onPress={() => setSelectedSportsbookIds([])}
            >
              <Text
                style={[
                  styles.actionButtonText,
                  selectedIds.length === 0 && styles.actionButtonTextEmphasized,
                ]}
              >
                All Books
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
              onPress={() => setSelectedSportsbookIds([])}
              disabled={selectedIds.length === 0}
            >
              <Text style={styles.actionButtonText}>Clear</Text>
            </Pressable>

            <View style={styles.actionsSpacer} />

            {selectedIds.length > 0 ? (
              <Text style={styles.selectedCount}>{`${selectedIds.length} selected`}</Text>
            ) : null}
          </View>

          <View style={styles.searchField}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search sportsbooks"
              placeholderTextColor={palette.mutedInk}
              value={searchText}
              onChangeText={setSearchText}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.grid}>
            {filteredSportsbooks.map((book) => {
              const isSelected = selectedIds.includes(book.id);
              return (
                <Pressable
                  key={book.id}
                  style={({ pressed }) => [
                    styles.bookRow,
                    isSelected && styles.bookRowSelected,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => toggle(book.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text
                    style={[styles.bookName, isSelected && styles.bookNameSelected]}
                    numberOfLines={2}
                  >
                    {book.name}
                  </Text>
                  {isSelected ? <Text style={styles.bookCheck}>✓</Text> : null}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </Modal>
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
    paddingBottom: 40,
    gap: 18,
  },
  headerBlock: {
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: palette.ink,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "500",
    color: palette.mutedInk,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: palette.softPanel,
  },
  actionButtonEmphasized: {
    backgroundColor: palette.lime,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: palette.mutedInk,
  },
  actionButtonTextEmphasized: {
    color: palette.ink,
  },
  actionsSpacer: {
    flex: 1,
  },
  selectedCount: {
    fontSize: 12,
    fontWeight: "700",
    color: palette.mutedInk,
  },
  searchField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
  },
  searchIcon: {
    fontSize: 13,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: palette.ink,
    padding: 0,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  bookRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexGrow: 1,
    flexBasis: "45%",
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: palette.headerBar,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  bookRowSelected: {
    backgroundColor: palette.lime,
    borderColor: "transparent",
  },
  bookName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: palette.headerText,
  },
  bookNameSelected: {
    color: palette.ink,
  },
  bookCheck: {
    fontSize: 12,
    fontWeight: "900",
    color: palette.ink,
  },
  pressed: {
    opacity: 0.82,
  },
});
