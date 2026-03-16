import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function CheckinScreen() {
  const [selected, setSelected] = useState<number | null>(null);

  const types = [1,2,3,4,5,6,7];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Daily Check-in</Text>

      <Text style={styles.label}>Bristol Stool Type</Text>

      <View style={styles.row}>
        {types.map((t) => (
          <Pressable
            key={t}
            style={[
              styles.box,
              selected === t && styles.selected
            ]}
            onPress={() => setSelected(t)}
          >
            <Text>{t}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.button}>
        <Text style={styles.buttonText}>Save Check-in</Text>
      </Pressable>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:1,
    padding:20
  },
  title:{
    fontSize:22,
    fontWeight:"600",
    marginBottom:20
  },
  label:{
    marginBottom:10
  },
  row:{
    flexDirection:"row",
    gap:10,
    marginBottom:20
  },
  box:{
    borderWidth:1,
    padding:12,
    borderRadius:10
  },
  selected:{
    backgroundColor:"#ddd"
  },
  button:{
    backgroundColor:"#3b6ef5",
    padding:15,
    borderRadius:10,
    alignItems:"center"
  },
  buttonText:{
    color:"white",
    fontWeight:"600"
  }
});