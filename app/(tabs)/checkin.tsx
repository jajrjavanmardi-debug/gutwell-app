
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { supabase } from "../../lib/supabase";
export default function CheckinScreen() {
  const [selected, setSelected] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const types = [1, 2, 3, 4, 5, 6, 7];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Daily Check-in</Text>

      <Text style={styles.label}>Bristol Stool Type</Text>

      <View style={styles.row}>
        {types.map((t) => (
          <Pressable
            key={t}
            style={[styles.box, selected === t && styles.selected]}
            onPress={() => setSelected(t)}
          >
            <Text>{t}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={styles.button}
       onPress={async () => {
  if (selected === null) {
    setMessage("Please select a type first");
    return;
  }

  const { error } = await supabase
    .from("checkins")
    .insert({
      stool_type: selected
    });

  if (error) {
    setMessage("Error saving check-in");
    console.log(error);
  } else {
    setMessage(`Check-in saved: ${selected}`);
  }
}}
      >
        <Text style={styles.buttonText}>Save Check-in</Text>
      </Pressable>

      {message !== "" && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    marginBottom: 20,
  },
  label: {
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
    flexWrap: "wrap",
  },
  box: {
    borderWidth: 1,
    padding: 12,
    borderRadius: 10,
    minWidth: 40,
    alignItems: "center",
  },
  selected: {
    backgroundColor: "#ddd",
  },
  button: {
    backgroundColor: "#3b6ef5",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonText: {
    color: "white",
    fontWeight: "600",
  },
  message: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: "500",
  },
});