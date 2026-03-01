// scripts/create-index.js
// Herramienta para recrear índices en la colección de productos
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { MongoClient } = require('mongodb');

const localEnvPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
} else {
  dotenv.config();
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI no definida');
    process.exit(1);
  }
  
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    const db = process.env.MONGODB_DB ? client.db(process.env.MONGODB_DB) : client.db();
    const collection = db.collection('products');
    
    console.log('\n📇 RECREAR ÍNDICES\n');
    
    // Eliminar índices existentes (excepto _id_)
    console.log('Eliminando índices anteriores...');
    try {
      const indexes = await collection.listIndexes().toArray();
      for (const idx of indexes) {
        if (idx.name !== '_id_') {
          await collection.dropIndex(idx.name);
          console.log(`  ✓ Eliminado: ${idx.name}`);
        }
      }
    } catch (e) {
      console.log('  (No hay índices que eliminar)');
    }
    
    // Crear índices nuevos
    console.log('\nCreando índices...');
    await collection.createIndex({ id: 1 });
    console.log('  ✓ Índice en: id');
    
    console.log('\n✅ Índices recreados\n');
    
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}\n`);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
