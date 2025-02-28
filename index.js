const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const admin = require("firebase-admin");
const cors = require("cors");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

app.use(express.json());
app.use(cors());

// Inicializar Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// Endpoint para obtener registros
app.get("/", async (req, res) => {
  res.send({ message: "Servidor activo" });
});
app.get("/registros", async (req, res) => {
  const snapshot = await db.collection("registros").get();
  const registros = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  res.json(registros);
});
// Endpoint para agregar un nuevo registro a Firestore
app.post("/registros", async (req, res) => {
  try {
    const data = req.body; // Get the data from the request
    const docRef = await db.collection("registros").add(data);
    res.status(201).json({ id: docRef.id, ...data }); // Respond with the document ID
  } catch (error) {
    console.error("Error adding record:", error);
    res.status(500).json({ error: "Could not add record" });
  }
});
// Update a record by ID (PUT)
app.put("/registros/:id", async (req, res) => {
  try {
    const { id } = req.params; // Get the document ID from the URL
    const data = req.body; // Get the updated data
    await db.collection("registros").doc(id).update(data);
    res.json({ message: "Registro actualizado", id });
  } catch (error) {
    console.error("Error updating record:", error);
    res.status(500).json({ error: "Could not update record" });
  }
});

// Delete a record by ID (DELETE)
app.delete("/registros/:id", async (req, res) => {
  try {
    const { id } = req.params; // Get the document ID from the URL
    await db.collection("registros").doc(id).delete();
    res.json({ message: "Registro eliminado", id });
  } catch (error) {
    console.error("Error deleting record:", error);
    res.status(500).json({ error: "Could not delete record" });
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en  http://localhost:${PORT}`);
});
