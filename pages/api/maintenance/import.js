// pages/api/maintenance/import.js
// POST: Importar productos desde scraper de Mercado Libre
import { connectToDatabase } from '../../../lib/mongodb';

function sanitizeObject(obj, depth = 0) {
  if (depth > 20) return obj;
  
  if (typeof obj === 'string') {
    let str = obj;
    if (str.normalize) str = str.normalize('NFC');
    str = str.replace(/[\uD800-\uDFFF]/g, '');
    str = str.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    return str;
  }
  
  if (Array.isArray(obj)) return obj.map(v => sanitizeObject(v, depth + 1));
  
  if (obj && typeof obj === 'object' && !Buffer.isBuffer(obj)) {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = sanitizeObject(v, depth + 1);
    }
    return result;
  }
  
  return obj;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const { db } = await connectToDatabase();
    const collection = db.collection('products');

    // Esperar productos en formato: { [id]: {...}, [id]: {...} } o [{...}, {...}]
    let products = req.body.data || req.body;
    
    if (!products) {
      return res.status(400).json({ error: 'Body requerido: data o array de productos' });
    }

    // Convertir a array si es objeto
    if (!Array.isArray(products)) {
      products = Object.values(products);
    }

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: 'Se requiere array de productos' });
    }

    console.log(`📥 Importando ${products.length} productos...`);

    // Sanitizar todos
    products = products.map(p => sanitizeObject(p));

    // Insertar con replace
    const ops = products.map(p => ({
      replaceOne: {
        filter: { id: p.id },
        replacement: p,
        upsert: true
      }
    }));

    const result = await collection.bulkWrite(ops, { ordered: false });

    console.log(`✅ Importación completada: ${result.upsertedCount} nuevos, ${result.modifiedCount} actualizados`);

    return res.status(200).json({
      success: true,
      message: 'Productos importados correctamente',
      stats: {
        total: products.length,
        upserted: result.upsertedCount || 0,
        modified: result.modifiedCount || 0
      }
    });
  } catch (err) {
    console.error('Error en import:', err);
    return res.status(500).json({
      error: 'Error al importar productos',
      message: err.message
    });
  }
}
