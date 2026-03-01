// pages/api/maintenance/health.js
// GET: Verificar salud de la BD
import { connectToDatabase } from '../../../lib/mongodb';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const { db } = await connectToDatabase();
    const collection = db.collection('products');

    // Test 1: Conteo
    const totalCount = await collection.countDocuments();

    // Test 2: Lectura
    const sampleDoc = await collection.findOne({});
    const sampleFieldCount = sampleDoc ? Object.keys(sampleDoc).length : 0;

    // Test 3: Intentar leer todos sin errores
    let readableCount = 0;
    let errorCount = 0;
    
    try {
      const cursor = collection.find({}).batchSize(50);
      while (await cursor.hasNext()) {
        try {
          await cursor.next();
          readableCount++;
        } catch (e) {
          errorCount++;
        }
      }
      await cursor.close();
    } catch (e) {
      console.error('Error leyendo cursor:', e.message);
    }

    return res.status(200).json({
      status: 'healthy',
      database: {
        totalDocuments: totalCount,
        readableDocuments: readableCount,
        corruptDocuments: errorCount,
        sampleFieldCount
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      message: err.message,
      timestamp: new Date().toISOString()
    });
  }
}
