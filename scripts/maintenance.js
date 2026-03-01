// scripts/maintenance.js
// ═══════════════════════════════════════════════════════════════════════════
// SCRIPT UNIFICADO: Mantenimiento BD Productos (import, normalize, clean, index)
// ═══════════════════════════════════════════════════════════════════════════
// 
// COMANDOS:
//   npm run maintenance import [archivo.json]   - Importar JSON
//   npm run maintenance normalize               - Normalizar datos existentes
//   npm run maintenance test                    - Test de lectura
//   npm run maintenance clean                   - Limpiar BD completamente
//   npm run maintenance index                   - Recrear índices
//
// EJEMPLOS:
//   npm run maintenance import data/productos.json
//   npm run maintenance import productos_final.json
//   npm run maintenance normalize
//   npm run maintenance test
//
// ═══════════════════════════════════════════════════════════════════════════

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

// ════════════════════════════════════════════════════════════════
// SANITIZACIÓN UNIVERSAL
// ════════════════════════════════════════════════════════════════

function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  
  // Normalizar Unicode
  if (str.normalize) str = str.normalize('NFC');
  
  // Remover surrogates mal formados
  str = str.replace(/[\uD800-\uDFFF]/g, '');
  
  // Remover caracteres de control (excepto tab, newline, CR)
  str = str.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  
  return str;
}

function sanitizeObject(obj, depth = 0) {
  if (depth > 20) return obj;
  
  if (typeof obj === 'string') return sanitizeString(obj);
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

// ════════════════════════════════════════════════════════════════
// FUNCIONES DE BD
// ════════════════════════════════════════════════════════════════

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI no definida');
  
  const client = new MongoClient(uri);
  await client.connect();
  const db = process.env.MONGODB_DB ? client.db(process.env.MONGODB_DB) : client.db();
  return { client, db, collection: db.collection('products') };
}

// ════════════════════════════════════════════════════════════════
// COMANDOS
// ════════════════════════════════════════════════════════════════

async function cmdImport(jsonPath) {
  console.log('\n📥 IMPORTAR JSON\n');
  
  if (!fs.existsSync(jsonPath)) {
    console.error(`❌ Archivo no encontrado: ${jsonPath}`);
    process.exit(1);
  }
  
  const { client, collection } = await connectDB();
  
  try {
    console.log('1️⃣  Leyendo JSON...');
    let raw = fs.readFileSync(jsonPath, 'utf8');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    
    const data = JSON.parse(raw);
    let products = Array.isArray(data) ? data : Object.values(data);
    console.log(`   ✓ ${products.length} productos leídos`);
    
    console.log('\n2️⃣  Sanitizando...');
    products = products.map(p => sanitizeObject(p));
    console.log('   ✓ Sanitizados');
    
    console.log('\n3️⃣  Limpiando BD...');
    await collection.deleteMany({});
    console.log('   ✓ Colección vaciada');
    
    console.log('\n4️⃣  Insertando...');
    const result = await collection.insertMany(products, { ordered: false });
    console.log(`   ✓ ${result.insertedCount} productos insertados`);
    
    console.log('\n5️⃣  Creando índice...');
    await collection.createIndex({ id: 1 }, { unique: true });
    console.log('   ✓ Índice creado');
    
    console.log('\n✅ Importación completada\n');
  } finally {
    await client.close();
  }
}

async function cmdNormalize() {
  console.log('\n🔧 NORMALIZAR DATOS\n');
  
  const { client, collection } = await connectDB();
  
  try {
    console.log('1️⃣  Obteniendo documentos...');
    const count = await collection.countDocuments();
    console.log(`   ✓ ${count} documentos`);
    
    console.log('\n2️⃣  Normalizando...');
    const docs = await collection.find({}).toArray();
    
    let updated = 0;
    for (const doc of docs) {
      const cleaned = sanitizeObject(doc);
      
      // Verificar si cambió
      if (JSON.stringify(doc) !== JSON.stringify(cleaned)) {
        await collection.replaceOne({ _id: doc._id }, cleaned);
        updated++;
      }
    }
    
    console.log(`   ✓ ${updated} documentos normalizados`);
    
    console.log('\n✅ Normalización completada\n');
  } finally {
    await client.close();
  }
}

async function cmdTest() {
  console.log('\n🧪 TEST DE LECTURA\n');
  
  const { client, collection } = await connectDB();
  
  try {
    console.log('1️⃣  Conteo...');
    const count = await collection.countDocuments();
    console.log(`   ✓ ${count} documentos`);
    
    console.log('\n2️⃣  Lectura completa (sin errores BSON)...');
    const all = await collection.find({}).toArray();
    console.log(`   ✓ ${all.length} leídos sin error`);
    
    console.log('\n3️⃣  Muestra de primer documento...');
    const sample = all[0] || {};
    console.log(`   ID: ${sample.id}`);
    console.log(`   Nombre: ${sample.name}`);
    console.log(`   Precio: $${sample.price}`);
    console.log(`   Campos totales: ${Object.keys(sample).length}`);
    console.log(`   Campos: ${Object.keys(sample).slice(0, 10).join(', ')}...`);
    
    console.log('\n✅ Test completado\n');
  } finally {
    await client.close();
  }
}

async function cmdClean() {
  console.log('\n🗑️  LIMPIAR BD\n');
  
  const { client, collection } = await connectDB();
  
  try {
    console.log('Eliminando todos los documentos...');
    const result = await collection.deleteMany({});
    console.log(`✓ ${result.deletedCount} documentos eliminados\n`);
  } finally {
    await client.close();
  }
}

async function cmdIndex() {
  console.log('\n📇 RECREAR ÍNDICES\n');
  
  const { client, collection } = await connectDB();
  
  try {
    // Eliminar índices existentes (excepto _id_)
    console.log('1️⃣  Eliminando índices anteriores...');
    try {
      const indexes = await collection.listIndexes().toArray();
      let removed = 0;
      for (const idx of indexes) {
        if (idx.name !== '_id_') {
          await collection.dropIndex(idx.name);
          console.log(`   ✓ ${idx.name}`);
          removed++;
        }
      }
      if (removed === 0) console.log('   (ninguno que eliminar)');
    } catch (e) {
      console.log('   (no hay índices)');
    }
    
    // Crear índices nuevos
    console.log('\n2️⃣  Creando índices nuevos...');
    
    // Índice único en id (para no duplicar)
    await collection.createIndex({ id: 1 }, { unique: true, sparse: true });
    console.log('   ✓ Índice único en: id');
    
    // Otros índices útiles para queries
    await collection.createIndex({ status: 1 });
    console.log('   ✓ Índice en: status');
    
    await collection.createIndex({ created_at: -1 });
    console.log('   ✓ Índice en: created_at');
    
    console.log('\n✅ Índices completados\n');
    
  } catch (err) {
    console.error(`\n⚠️  Error en índices: ${err.message}\n`);
    // No hacemos exit(1), solo advertencia
  } finally {
    await client.close();
  }
}

// ════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════

async function main() {
  const cmd = process.argv[2];
  
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║   MANTENIMIENTO DE BD - PRODUCTOS      ║');
  console.log('║   (import, normalize, test, clean, index)  ║');
  console.log('╚════════════════════════════════════════════╝');
  
  try {
    if (cmd === 'import') {
      const file = process.argv[3] || path.join(process.cwd(), 'productos_final.json');
      await cmdImport(file);
    } else if (cmd === 'normalize') {
      await cmdNormalize();
    } else if (cmd === 'test') {
      await cmdTest();
    } else if (cmd === 'clean') {
      await cmdClean();
    } else if (cmd === 'index') {
      await cmdIndex();
    } else {
      console.log('\n📖 COMANDOS DISPONIBLES:\n');
      console.log('  import [archivo]     Importar JSON (default: productos_final.json)');
      console.log('  normalize            Sanitizar y normalizar datos existentes');
      console.log('  test                 Test de lectura (verifica integridad)');
      console.log('  clean                Limpiar toda la colección');
      console.log('  index                Recrear índices\n');
      
      console.log('📝 EJEMPLOS:\n');
      console.log('  npm run maintenance import data/productos.json');
      console.log('  npm run maintenance import productos_final.json');
      console.log('  npm run maintenance normalize');
      console.log('  npm run maintenance test');
      console.log('  npm run maintenance clean');
      console.log('  npm run maintenance index\n');
      
      console.log('🔄 FLUJO TÍPICO DESPUÉS DE SCRAPER:\n');
      console.log('  1. npm run maintenance import productos_final.json');
      console.log('  2. npm run maintenance normalize (si hay errores UTF-8)');
      console.log('  3. npm run maintenance test\n');
    }
    process.exit(0);
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
