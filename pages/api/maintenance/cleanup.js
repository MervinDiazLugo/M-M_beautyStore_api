// pages/api/maintenance/cleanup.js
// DELETE: Elimina la colección completamente

import { connectToDatabase } from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', ['DELETE']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const { db } = await connectToDatabase();
    const collection = db.collection('products');

    console.log('🗑️  Eliminando colección "products" completamente...');

    try {
      await collection.drop();
      console.log('✅ Colección eliminada');

      return res.status(200).json({
        success: true,
        message: 'Colección "products" eliminada completamente',
        note: 'La próxima importación creará la colección limpia',
      });
    } catch (e) {
      if (e.message.includes('ns not found')) {
        console.log('✅ La colección ya no existe');
        return res.status(200).json({
          success: true,
          message: 'La colección ya está eliminada',
        });
      }
      throw e;
    }
  } catch (error) {
    console.error('❌ Error en cleanup:', error.message);
    return res.status(500).json({
      error: 'Error al limpiar la base de datos',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}
