const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

// Inicializar Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// Colecciones válidas
const collections = ["arribos1", "productos1", "registros"];

// Estado efímero (en memoria)
let ephemeralData = {
  arribo: [],
  mesas: [],
  productos: [],
};

// GET: Obtener datos efímeros
app.get("/api/:collection/ephemeral", (req, res) => {
  const { collection } = req.params;
  if (!collections.includes(collection))
    return res.status(400).json({ error: "Colección inválida" });

  res.status(200).json(ephemeralData[collection]);
});

// POST: Agregar un nuevo registro efímero
app.post("/api/:collection/ephemeral", (req, res) => {
  const { collection } = req.params;
  const data = req.body;
  if (!collections.includes(collection))
    return res.status(400).json({ error: "Colección inválida" });

  ephemeralData[collection].push(data);
  res.status(201).json({ message: "Registro efímero agregado", data });
});

// PUT: Actualizar un registro efímero por ID
app.put("/api/:collection/ephemeral/:id", (req, res) => {
  const { collection, id } = req.params;
  const updateData = req.body;

  if (!collections.includes(collection))
    return res.status(400).json({ error: "Colección inválida" });

  ephemeralData[collection] = ephemeralData[collection].map((item) =>
    item.id === id ? { ...item, ...updateData } : item
  );
  res.status(200).json({ message: "Registro efímero actualizado" });
});

// DELETE: Eliminar un registro efímero por ID
app.delete("/api/:collection/ephemeral/:id", (req, res) => {
  const { collection, id } = req.params;

  if (!collections.includes(collection))
    return res.status(400).json({ error: "Colección inválida" });

  ephemeralData[collection] = ephemeralData[collection].filter(
    (item) => item.id !== id
  );
  res.status(200).json({ message: "Registro efímero eliminado" });
});

// POST: Guardar registro efímero en Firestore y eliminarlo del estado efímero
app.post("/api/:collection/save", async (req, res) => {
  const { collection } = req.params;
  const { id, data } = req.body;

  if (!collections.includes(collection))
    return res.status(400).json({ error: "Colección inválida" });

  try {
    await db.collection(collection).add(data);
    ephemeralData[collection] = ephemeralData[collection].filter(
      (item) => item.id !== id
    );
    res.status(201).json({
      message: "Guardado en Firestore y eliminado del estado efímero",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al guardar el documento" });
  }
});

// GET: Obtener documentos persistidos de Firestore
app.get("/api/:collection", async (req, res) => {
  const { collection } = req.params;

  if (!collections.includes(collection))
    return res.status(400).json({ error: "Colección inválida" });

  try {
    const snapshot = await db.collection(collection).get();
    const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(docs);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener los documentos" });
  }
});

// POST: Crear documento persistente
app.post("/api/:collection", async (req, res) => {
  const { collection } = req.params;
  const data = req.body;

  if (!collections.includes(collection))
    return res.status(400).json({ error: "Colección inválida" });

  try {
    const docRef = await db.collection(collection).add(data);
    res.status(201).json({ id: docRef.id, ...data });
  } catch (error) {
    res.status(500).json({ error: "Error al crear el documento" });
  }
});

// DELETE: Eliminar documento persistente
app.delete("/api/:collection/:id", async (req, res) => {
  const { collection, id } = req.params;

  if (!collections.includes(collection))
    return res.status(400).json({ error: "Colección inválida" });

  try {
    await db.collection(collection).doc(id).delete();
    res.status(200).json({ message: "Documento eliminado" });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar el documento" });
  }
});

// Server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () =>
  console.log(`Servidor REST corriendo en http://localhost:${PORT}`)
);
