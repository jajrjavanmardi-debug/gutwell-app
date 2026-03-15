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
  container:{
    flex:1,
    padding:20,
    paddingTop:60
  },

  title:{
    fontSize:28,
    fontWeight:"600",
    marginBottom:20
  },

  label:{
    fontSize:18,
    marginBottom:10
  },

  row:{
    flexDirection:"row",
    flexWrap:"wrap",
    gap:10
  },

  box:{
    width:50,
    height:50,
    borderRadius:10,
    borderWidth:1,
    justifyContent:"center",
    alignItems:"center"
  },

  selected:{
    backgroundColor:"#2563EB"
  },

  button:{
    marginTop:40,
    backgroundColor:"#2563EB",
    padding:15,
    borderRadius:10,
    alignItems:"center"
  },

  buttonText:{
    color:"white",
    fontWeight:"600"
  }
});