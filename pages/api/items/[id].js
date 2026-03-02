// pages/api/items/[id].js
import { connectToDatabase } from '../../../lib/db';
import { validateSecurityKey } from '../../../lib/auth';

function sanitizeString(str) {
    if (typeof str !== 'string' || !str) return str;

    // FORzar UTF-8 válido: convertir a buffer y volver
    try {
        const buf = Buffer.from(str, 'utf8');
        str = buf.toString('utf8');
    } catch (e) {
        return '';
    }
    
    // Quitar replacement chars
    str = str.replace(/\uFFFD/g, '');
    
    // Quitar surrogates
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

export default async function handler(req, res) {
    const { id } = req.query;
    const { db } = await connectToDatabase();
    const collection = db.collection('products');

    // GET /api/items/:id
    if (req.method === 'GET') {
        try {
            const item = await collection.findOne({ id });
            if (!item) return res.status(404).json({ error: 'No encontrado' });
            return res.status(200).json(sanitizeObject(item));
        } catch (err) {
            console.error('Error reading document:', err.message);
            return res.status(500).json({ error: 'Documento corrupto en BD' });
        }
    }

    // PUT /api/items/:id — reemplazo completo
    if (req.method === 'PUT') {
        const auth = validateSecurityKey(req, res);
        if (!auth.valid) return res.status(401).json({ error: auth.error });
        
        const body = req.body;
        if (!body || typeof body !== 'object') {
            return res.status(400).json({ error: 'Body requerido' });
        }
        // Return what we received for debugging
        console.log('PUT body received:', JSON.stringify(body));
        body.id = id;
        await collection.replaceOne({ id }, body, { upsert: true });
        return res.status(200).json({ success: true, received: body });
    }

    // PATCH /api/items/:id — actualización parcial
    if (req.method === 'PATCH') {
        const auth = validateSecurityKey(req, res);
        if (!auth.valid) return res.status(401).json({ error: auth.error });
        
        const body = req.body;
        if (!body || typeof body !== 'object') {
            return res.status(400).json({ error: 'Body requerido' });
        }
        const existing = await collection.findOne({ id });
        if (!existing) return res.status(404).json({ error: 'No encontrado' });
        await collection.updateOne({ id }, { $set: body });
        return res.status(200).json({ success: true, message: 'Actualizado' });
    }

    // DELETE /api/items/:id
    if (req.method === 'DELETE') {
        const result = await collection.deleteOne({ id });
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'No encontrado' });
        }
        return res.status(204).end();
    }

    res.setHeader('Allow', ['GET', 'PUT', 'PATCH', 'DELETE']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
}
