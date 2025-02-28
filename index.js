const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow connections from any origin
  },
});

// Initialize Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// This array holds the temporary (ephemeral) registration data shared among all clients.
let ephemeralRegistros = [];

// Utility: (For the view page) Fetch all persisted registros from Firestore.
async function fetchAllPersistedRegistros() {
  const snapshot = await db.collection("registros").get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

io.on("connection", (socket) => {
  console.log("Usuario conectado:", socket.id);

  // When a client connects to the registration page, send them the current ephemeral state.
  socket.on("get_registros", () => {
    socket.emit("update_registros", ephemeralRegistros);
  });

  // When a new row is added (e.g., via "Agregar Fila")
  socket.on("nuevo_registro", (data) => {
    // data should include a unique id (generated on the client)
    ephemeralRegistros.push(data);
    io.emit("update_registros", ephemeralRegistros);
  });

  // When a field (description, observation, times) is updated in a row
  socket.on("actualizar_registro", ({ id, data }) => {
    ephemeralRegistros = ephemeralRegistros.map((registro) =>
      registro.id === id ? { ...registro, ...data } : registro
    );
    io.emit("update_registros", ephemeralRegistros);
  });

  // When a row is "sent" (Enviar button): save the data to Firestore and remove it from ephemeral state.
  socket.on("guardar_registro", async ({ id, data }) => {
    try {
      await db.collection("registros").add(data);
      // Remove the row from the ephemeral state after saving.
      ephemeralRegistros = ephemeralRegistros.filter(
        (registro) => registro.id !== id
      );
      io.emit("update_registros", ephemeralRegistros);
    } catch (error) {
      console.error("Error saving registro:", error);
    }
  });

  // When a row is deleted from the registration table.
  socket.on("eliminar_registro", (id) => {
    if (!id) {
      console.error("Error: ID is undefined or empty");
      return;
    }
    ephemeralRegistros = ephemeralRegistros.filter(
      (registro) => registro.id !== id
    );
    io.emit("update_registros", ephemeralRegistros);
  });

  socket.on("get_persisted_registros", async () => {
    const registros = await fetchAllPersistedRegistros();
    socket.emit("update_persisted_registros", registros);
  });

  socket.on("eliminar_registro_persistido", async (id) => {
    if (!id) {
      console.error("Error: ID is undefined or empty");
      return;
    }
    try {
      await db.collection("registros").doc(String(id)).delete();
      const registros = await fetchAllPersistedRegistros();
      io.emit("update_persisted_registros", registros);
    } catch (error) {
      console.error("Error deleting persisted registro:", error);
    }
  });

  socket.on("disconnect", () => {
    console.log("Usuario desconectado:", socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () =>
  console.log(`Servidor WebSocket en http://localhost:${PORT}`)
);
