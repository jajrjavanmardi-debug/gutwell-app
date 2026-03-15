import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function HomeScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>GutWell</Text>
      <Text style={styles.subtitle}>
        Constipation support made simple
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Daily Check-in</Text>
        <Text style={styles.cardText}>
          Track stool type, bowel frequency, hydration and fiber intake.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Food Lookup</Text>
        <Text style={styles.cardText}>
          Search foods like kiwi, prunes or oats and see if they help digestion.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Progress</Text>
        <Text style={styles.cardText}>
          Review weekly trends and track improvements.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 60,
    backgroundColor: "#F7FAFC",
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    marginBottom: 8,
    color: "#1F2937",
  },
  subtitle: {
    fontSize: 18,
    marginBottom: 24,
    color: "#4B5563",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 6,
  },
  cardText: {
    fontSize: 16,
    color: "#555",
  },
});