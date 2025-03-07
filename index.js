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
    origin: "*", // Permite conexiones de cualquier origen
  },
});

// Inicializar Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// Definimos las colecciones de interés
const collections = ["arribo", "mesas", "productos"];

// Estado efímero para cada colección
let ephemeralData = {
  arribo: [],
  mesas: [],
  productos: [],
};

// Utilidad para obtener todos los documentos persistidos de una colección
async function fetchAllPersistedDocs(collectionName) {
  const snapshot = await db.collection(collectionName).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

// Socket.IO: eventos por conexión
io.on("connection", (socket) => {
  console.log("Usuario conectado:", socket.id);

  // Para cada colección se registran los eventos correspondientes
  collections.forEach((collection) => {
    // Obtener datos efímeros
    socket.on("get_" + collection, () => {
      socket.emit("update_" + collection, ephemeralData[collection]);
    });

    // Agregar un nuevo registro efímero
    socket.on("nuevo_" + collection, (data) => {
      ephemeralData[collection].push(data);
      io.emit("update_" + collection, ephemeralData[collection]);
    });

    // Actualizar un registro efímero
    socket.on("actualizar_" + collection, ({ id, data }) => {
      ephemeralData[collection] = ephemeralData[collection].map((registro) =>
        registro.id === id ? { ...registro, ...data } : registro
      );
      io.emit("update_" + collection, ephemeralData[collection]);
    });

    // Guardar el registro efímero en Firestore y eliminarlo del estado efímero
    socket.on("guardar_" + collection, async ({ id, data }) => {
      try {
        await db.collection(collection).add(data);
        ephemeralData[collection] = ephemeralData[collection].filter(
          (registro) => registro.id !== id
        );
        io.emit("update_" + collection, ephemeralData[collection]);
      } catch (error) {
        console.error(`Error al guardar en ${collection}:`, error);
      }
    });

    // Eliminar un registro del estado efímero
    socket.on("eliminar_" + collection, (id) => {
      if (!id) {
        console.error("Error: ID es indefinido o vacío");
        return;
      }
      ephemeralData[collection] = ephemeralData[collection].filter(
        (registro) => registro.id !== id
      );
      io.emit("update_" + collection, ephemeralData[collection]);
    });

    // Obtener documentos persistidos de Firestore
    socket.on("get_persisted_" + collection, async () => {
      const docs = await fetchAllPersistedDocs(collection);
      socket.emit("update_persisted_" + collection, docs);
    });

    // Eliminar un documento persistido de Firestore
    socket.on("eliminar_registro_persistido_" + collection, async (id) => {
      if (!id) {
        console.error("Error: ID es indefinido o vacío");
        return;
      }
      try {
        await db.collection(collection).doc(String(id)).delete();
        const docs = await fetchAllPersistedDocs(collection);
        io.emit("update_persisted_" + collection, docs);
      } catch (error) {
        console.error(`Error al eliminar documento de ${collection}:`, error);
      }
    });
  });

  socket.on("disconnect", () => {
    console.log("Usuario desconectado:", socket.id);
  });
});

// Endpoints REST para cada colección (POST, GET y DELETE)

// GET: Obtener todos los documentos de una colección
app.get("/api/:collection", async (req, res) => {
  const { collection } = req.params;
  if (!collections.includes(collection)) {
    return res.status(400).json({ error: "Colección inválida" });
  }
  try {
    const snapshot = await db.collection(collection).get();
    const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(docs);
  } catch (error) {
    console.error(`Error obteniendo documentos de ${collection}:`, error);
    res.status(500).json({ error: "Error al obtener los documentos" });
  }
});

// POST: Crear un nuevo documento en una colección
app.post("/api/:collection", async (req, res) => {
  const { collection } = req.params;
  if (!collections.includes(collection)) {
    return res.status(400).json({ error: "Colección inválida" });
  }
  const data = req.body;
  try {
    const docRef = await db.collection(collection).add(data);
    res.status(201).json({ id: docRef.id, ...data });
  } catch (error) {
    console.error(`Error creando documento en ${collection}:`, error);
    res.status(500).json({ error: "Error al crear el documento" });
  }
});

// DELETE: Eliminar un documento de una colección
app.delete("/api/:collection/:id", async (req, res) => {
  const { collection, id } = req.params;
  if (!collections.includes(collection)) {
    return res.status(400).json({ error: "Colección inválida" });
  }
  try {
    await db.collection(collection).doc(String(id)).delete();
    res.status(200).json({ message: "Documento eliminado correctamente" });
  } catch (error) {
    console.error(`Error eliminando documento de ${collection}:`, error);
    res.status(500).json({ error: "Error al eliminar el documento" });
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () =>
  console.log(`Servidor corriendo en http://localhost:${PORT}`)
);
