// pages/api/items/index.js
import { connectToDatabase } from '../../../lib/db';
import fs from 'fs';
import path from 'path';

// sanitize simple - solo limpia valores, no keys
function sanitizeString(str) {
  if (typeof str !== 'string' || !str) return str;

  // Solo quitar replacement chars y surrogates - NO quitar acentos
  str = str.replace(/\uFFFD/g, '');
  str = str.replace(/[\uD800-\uDFFF]/g, '');

  return str;
}

function sanitizeObject(obj, depth = 0) {
  if (depth > 50) return obj;
  if (obj === null || obj === undefined) return obj;
  
  if (Array.isArray(obj)) {
    return obj
      .filter((v) => v !== null && v !== undefined)
      .map((v) => sanitizeObject(v, depth + 1));
  }
  
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  
  if (typeof obj === 'object') {
    if (obj instanceof Date) {
      return obj.toISOString();
    }
    if (obj.$oid) {
      return obj.$oid;
    }
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === '_id') continue;
      const cleanValue = sanitizeObject(v, depth + 1);
      if (cleanValue !== null && cleanValue !== undefined) {
        out[k] = cleanValue;
      }
    }
    return out;
  }
  
  return obj;
}

const dataPath = path.join(process.cwd(), 'data', 'products.json');

function readLocalData() {
  try {
    const raw = fs.readFileSync(dataPath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

export default async function handler(req, res) {
  const { db } = await connectToDatabase();
  const collection = db.collection('products');

  if (req.method === 'GET') {
    try {
      const count = await collection.countDocuments();
      if (count === 0) {
        const local = readLocalData();
        const arr = Object.values(local);
        return res.status(200).json(arr);
      }
    } catch (e) {
      console.warn('countDocuments failed:', e.message);
    }
    
    // Try to get all items with error handling
    const out = [];
    try {
      const cursor = collection.find({});
      while (await cursor.hasNext()) {
        try {
          const doc = await cursor.next();
          try {
            out.push(sanitizeObject(doc));
          } catch (sanitizeErr) {
            console.warn('Skipping corrupt document (sanitize failed):', sanitizeErr.message);
            continue;
          }
        } catch (docErr) {
          console.warn('Skipping corrupt document:', docErr.message);
          continue;
        }
      }
    } catch (err) {
      console.warn('find() failed:', err.message);
    }
    
    return res.status(200).json(out);
  }

  if (req.method === 'POST') {
    const body = req.body;
    if (!body || !body.id) return res.status(400).json({ error: 'id requerido' });
    const exists = await collection.findOne({ id: body.id });
    if (exists) return res.status(409).json({ error: 'id ya existe' });
    // Sanitizar antes de guardar
    const cleaned = sanitizeObject(body);
    await collection.insertOne(cleaned);
    return res.status(201).json(cleaned);
  }

  res.setHeader('Allow', ['GET','POST']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}
