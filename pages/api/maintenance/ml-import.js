// pages/api/maintenance/ml-import.js
// POST: Recibe IDs de MercadoLibre, scrapea la API de ML, normaliza y guarda en Supabase
//
// Uso:
//   POST /api/maintenance/ml-import
//   Body: { "ids": ["MLA1510055959", "MLA1519662745", ...] }
//


import { connectToDatabase } from '../../../lib/db';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN ML API
// ─────────────────────────────────────────────────────────────────────────────

const ML_CLIENT_ID = process.env.MERCADOLIBRE_CLIENT_ID;
const ML_CLIENT_SECRET = process.env.MERCADOLIBRE_CLIENT_SECRET;
const ML_TOKEN_URL = 'https://api.mercadolibre.com/oauth/token';
const ML_ITEMS_URL = 'https://api.mercadolibre.com/items/';

const HEADERS_BASE = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
};

const ATTRIBUTES =
  'id,title,price,original_price,condition,permalink,thumbnail,pictures,' +
  'shipping,attributes,sold_quantity,available_quantity,status';

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extrae / normaliza un ID de ML desde texto o URL */
function extractId(input) {
  if (!input || typeof input !== 'string') return null;
  const line = input.trim();
  if (!line) return null;

  // Formato: MLA1234567 o MLAU1234567890
  const matchUrl = line.match(/(MLA|MLAU)(\d{6,})/);
  if (matchUrl) return `${matchUrl[1]}${matchUrl[2]}`;

  // Formato: U1234567890 → MLAU
  const matchU = line.match(/^U(\d{10})$/);
  if (matchU) return `MLAU${matchU[1]}`;

  // Solo números (10 dígitos)
  const matchNum = line.match(/^\d{10}$/);
  if (matchNum) return `MLAU${matchNum[0]}`;

  return null;
}

// Sanitización simple - igual que en items/[id].js

function sanitizeString(str) {
  if (typeof str !== 'string' || !str) return str;

  // Solo quitar replacement chars y surrogates - NO quitar acentos
  str = str.replace(/\uFFFD/g, '');
  str = str.replace(/[\uD800-\uDFFF]/g, '');

  return str;
}

/** Fuerza UTF-8 válido - versión agresiva */
function forceUTF8(str) {
  if (typeof str !== 'string') return str;
  
  // Primero intentar Buffer normal
  try {
    const buf = Buffer.from(str, 'utf8');
    const result = buf.toString('utf8');
    // Verificar que no tenga replacement chars
    if (!result.includes('\uFFFD')) return result;
  } catch (e) {}
  
  // Si tiene replacement chars o falló, intentar latin1
  try {
    const buf = Buffer.from(str, 'latin1');
    const result = buf.toString('utf8');
    if (!result.includes('\uFFFD')) return result;
  } catch (e) {}
  
  // Si todo falla, quitar todo lo que no sea ASCII printable
  return str.replace(/[^\x20-\x7E\x09\x0A\x0D]/g, '?');
}

/** Limpia todos los campos de texto recursively */
function cleanAllTextFields(obj, depth = 0) {
  if (depth > 20) return obj;
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return forceUTF8(obj);
  if (Array.isArray(obj)) return obj.map(v => cleanAllTextFields(v, depth + 1));
  if (typeof obj === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      // No guardar estos campos por problemas de encoding
      if (k === 'description' || k === 'name' || k === 'desc' || k === 'brand') {
        result[k] = 'N/A';
      } else {
        result[k] = cleanAllTextFields(v, depth + 1);
      }
    }
    return result;
  }
  return obj;
}

/** Sanitiza solo campos de texto críticos */
function sanitizeTextFields(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  
  const textFields = ['name', 'desc', 'description', 'brand', 'title'];
  const result = { ...obj };
  
  for (const field of textFields) {
    if (result[field] && typeof result[field] === 'string') {
      result[field] = sanitizeString(result[field]);
    }
  }
  
  // Sanitizar specifications
  if (result.specifications && typeof result.specifications === 'object') {
    const newSpecs = {};
    for (const [k, v] of Object.entries(result.specifications)) {
      newSpecs[k] = typeof v === 'string' ? sanitizeString(v) : v;
    }
    result.specifications = newSpecs;
  }
  
  return result;
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

// ─────────────────────────────────────────────────────────────────────────────
// ML API
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// ML API
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch que intenta detectar encoding correcto */
async function fetchAsJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) return { _httpStatus: res.status };

  const buffer = await res.arrayBuffer();
  const uint8 = new Uint8Array(buffer);
  
  // Primero probar UTF-8
  let text = new TextDecoder('utf-8', { fatal: false }).decode(uint8);
  
  // Si tiene muchos replacement chars, probar Latin-1
  const brokenCount = (text.match(/\uFFFD/g) || []).length;
  if (brokenCount > 2) {
    text = new TextDecoder('latin1').decode(uint8);
  }
  
  return JSON.parse(text);
}

/** Obtiene access token de ML (client_credentials) */
async function getAccessToken() {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: ML_CLIENT_ID,
    client_secret: ML_CLIENT_SECRET,
  });

  const res = await fetch(ML_TOKEN_URL, {
    method: 'POST',
    headers: { ...HEADERS_BASE, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ML OAuth falló (${res.status}): ${text}`);
  }

  const data = await res.json();
  if (!data.access_token) throw new Error('ML no devolvió access_token');
  return data.access_token;
}

/** Obtiene la descripción de un item */
async function fetchDescription(itemId, token) {
  try {
    const data = await fetchAsJson(`${ML_ITEMS_URL}${itemId}/description`, {
      headers: { ...HEADERS_BASE, Authorization: `Bearer ${token}` },
    });
    if (data._httpStatus) return '';

    // Buscar el texto más limpio disponible
    let text = '';
    
    //plain_text es el más limpio
    if (data.plain_text) {
      text = data.plain_text;
    } else if (data.text) {
      //si hay HTML, limpiar entities
      text = data.text
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(num))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    }
    
    if (!text) return '';
    
    return sanitizeString(text.trim());
  } catch {
    return '';
  }
}

/** Obtiene los datos completos de un producto de ML y los transforma */
async function fetchProduct(itemId, token) {
  const url = `${ML_ITEMS_URL}${itemId}?attributes=${ATTRIBUTES}`;

  const data = await fetchAsJson(url, {
    headers: { ...HEADERS_BASE, Authorization: `Bearer ${token}` },
  });

  if (data._httpStatus) {
    throw new Error(`ML API ${data._httpStatus} para ${itemId}`);
  }

  // Descripción
  const fullDescription = await fetchDescription(itemId, token);

  let descShort;
  if (fullDescription) {
    const match = fullDescription.match(/^(.+?[.!?])\s*\n?/s);
    descShort = match ? match[1].trim() : fullDescription.slice(0, 150).trim();
  } else {
    descShort = (data.title || '').trim();
  }

  // Specs & features
  const specs = {};
  for (const attr of data.attributes || []) {
    if (attr.value_name) specs[attr.name] = sanitizeString(attr.value_name);
  }
  const featuresRaw = specs['Funciones'] || specs['Características'] || '';
  const features = featuresRaw
    .split(',')
    .map((f) => sanitizeString(f.trim()))
    .filter(Boolean);

  // Imágenes (hasta 8, usar secure_url)
  const pictures = data.pictures || [];
  let images = pictures
    .map((p) => p.secure_url)
    .filter(Boolean)
    .slice(0, 8);
  if (images.length === 0 && data.thumbnail) {
    images = [data.thumbnail.replace('I.jpg', 'O.jpg').replace('http://', 'https://')];
  }

  // Precios
  const brand = specs['Marca'] || 'Desconocida';
  const mlPrice = data.price || 0;

  let priceNeto = 0;
  if (mlPrice > 0) {
    const comision = mlPrice * 0.055;
    priceNeto = Math.round(Math.max(mlPrice - (comision + 600), 0));
  }

  const precioMayorista = priceNeto > 0 ? Math.round(priceNeto * 0.8) : 0;

  // Cantidad mínima mayorista por tier
  let cantidadMinima;
  if (priceNeto <= 2999) cantidadMinima = 50;
  else if (priceNeto <= 5999) cantidadMinima = 36;
  else if (priceNeto <= 8999) cantidadMinima = 18;
  else cantidadMinima = 12;

  // Envío gratis
  const envioGratis = priceNeto > 60000;

  // Cantidad vendida (real + offset aleatorio)
  const soldQuantityReal = data.sold_quantity || 0;
  const cantidadVendida = soldQuantityReal + Math.floor(Math.random() * 201) + 800; // 800-1000

  // Estado
  const status = data.status;
  const published = status ? status === 'active' : true;

  const permalink =
    data.permalink || `https://articulo.mercadolibre.com.ar/${itemId}`;

  return {
    id: itemId,
    name: sanitizeString(data.title || ''),
    ml_price: mlPrice,
    price: priceNeto,
    precio_mayorista: precioMayorista,
    cantidad_minima_mayorista: cantidadMinima,
    cantidad_vendida: cantidadVendida,
    sold_quantity_real: soldQuantityReal,
    desc: sanitizeString(descShort),
    sku: itemId,
    image: images,
    envioGratis,
    description: sanitizeString(fullDescription || 'Descripción no disponible.'),
    features,
    specifications: specs,
    mercadoLibreUrl: permalink,
    brand: sanitizeString(brand),
    condition: data.condition || 'new',
    sold_quantity: cantidadVendida,
    available_quantity: data.available_quantity || 0,
    published,
    permalink,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER
// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({
      error: `Method ${req.method} not allowed`,
      message: 'Use POST con { "ids": ["MLA..."] }',
    });
  }

  try {
    // ─── Validar credenciales ───
    if (!ML_CLIENT_ID || !ML_CLIENT_SECRET) {
      return res.status(500).json({
        error: 'Configuración incompleta',
        message: 'Faltan MERCADOLIBRE_CLIENT_ID o MERCADOLIBRE_CLIENT_SECRET en .env.local',
      });
    }

    // ─── Validar body ───
    const rawIds = req.body?.ids;
    if (!rawIds || !Array.isArray(rawIds) || rawIds.length === 0) {
      return res.status(400).json({
        error: 'Body inválido',
        message: 'Envía: { "ids": ["MLA1510055959", "MLA1519662745", ...] }',
      });
    }

    // Normalizar IDs
    const ids = [];
    const invalidIds = [];
    for (const raw of rawIds) {
      const id = extractId(raw);
      if (id) {
        ids.push(id);
      } else {
        invalidIds.push(raw);
      }
    }

    if (ids.length === 0) {
      return res.status(400).json({
        error: 'Sin IDs válidos',
        message: 'Ningún ID pudo ser parseado. Formato esperado: MLA1234567890',
        invalidIds,
      });
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🚀 ML-IMPORT: ${ids.length} productos a importar`);
    console.log(`${'═'.repeat(60)}\n`);

    // ─── Autenticación ML ───
    console.log('🔑 Obteniendo access token de MercadoLibre...');
    const token = await getAccessToken();
    console.log('✅ Token obtenido\n');

    // ─── Scraping ───
    const results = {
      total: ids.length,
      success: 0,
      failed: 0,
      upserted: 0,
      modified: 0,
      errors: [],
      products: [],
    };

    const validProducts = [];

    // Procesar en lotes concurrentes de 5 para evitar timeout
    const BATCH_SIZE = 5;
    for (let batchStart = 0; batchStart < ids.length; batchStart += BATCH_SIZE) {
      const batch = ids.slice(batchStart, batchStart + BATCH_SIZE);
      const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(ids.length / BATCH_SIZE);
      console.log(`\n📦 Lote ${batchNum}/${totalBatches} (${batch.length} items)...`);

      const batchResults = await Promise.allSettled(
        batch.map(async (itemId, idx) => {
          const globalIdx = batchStart + idx + 1;
          console.log(`  [${globalIdx}/${ids.length}] ${itemId}...`);
          const product = await fetchProduct(itemId, token);
          return { itemId, product };
        })
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          const { itemId, product } = result.value;
          // NO sanitizar - guardar directo
          validProducts.push(product);
          results.success++;
          console.log(
            `  ✅ ${product.name?.slice(0, 50) || itemId} | $${product.ml_price} → $${product.price} neto`
          );
        } else {
          const errMsg = result.reason?.message || String(result.reason);
          // Extraer el ID del mensaje de error
          const idMatch = errMsg.match(/MLA\w+/);
          const failedId = idMatch ? idMatch[0] : 'unknown';
          results.failed++;
          results.errors.push({ id: failedId, error: errMsg });
          console.log(`  ❌ ${errMsg}`);
        }
      }

      // Pequeño delay entre lotes para no saturar la API
      if (batchStart + BATCH_SIZE < ids.length) {
        await sleep(200);
      }
    }

    if (invalidIds.length > 0) {
      console.log(`\n⚠️  ${invalidIds.length} IDs inválidos ignorados: ${invalidIds.join(', ')}`);
    }

    if (validProducts.length === 0) {
      return res.status(400).json({
        error: 'Sin productos válidos',
        message: 'No se pudo obtener ningún producto de MercadoLibre',
        results,
      });
    }

    // ─── Insertar en Supabase ───
    console.log(`\n📝 Guardando ${validProducts.length} productos en Supabase...`);

    const { db } = await connectToDatabase();
    const collection = db.collection('products');
    
    let inserted = 0;
    let modified = 0;
    for (const p of validProducts) {
      try {
        const result = await collection.replaceOne({ id: p.id }, p, { upsert: true });
        if (result.upsertedCount) inserted++;
        if (result.modifiedCount) modified++;
      } catch (err) {
        console.warn(`  ⚠️ Error guardando ${p.id}:`, err.message);
      }
    }
    results.upserted = inserted;
    results.modified = modified;
    console.log(`✅ ${inserted} productos insertados, ${modified} modificados`);

    // Agregar productos procesados al resultado
    results.products = validProducts.map((p) => ({
      id: p.id,
      name: p.name,
      ml_price: p.ml_price,
      price: p.price,
      precio_mayorista: p.precio_mayorista,
      cantidad_minima_mayorista: p.cantidad_minima_mayorista,
      cantidad_vendida: p.cantidad_vendida,
      sold_quantity_real: p.sold_quantity_real,
      desc: p.desc,
      sku: p.sku,
      image: p.image,
      envioGratis: p.envioGratis,
      description: p.description,
      features: p.features,
      specifications: p.specifications,
      mercadoLibreUrl: p.mercadoLibreUrl,
      brand: p.brand,
      condition: p.condition,
      sold_quantity: p.sold_quantity,
      available_quantity: p.available_quantity,
      published: p.published,
      permalink: p.permalink,
    }));

    // ─── Resumen ───
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📊 RESUMEN ML-IMPORT`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`Total IDs recibidos: ${results.total}`);
    console.log(`Scrapeados OK:       ${results.success}`);
    console.log(`Fallidos:            ${results.failed}`);
    console.log(`Nuevos en BD:        ${results.upserted}`);
    console.log(`Actualizados:        ${results.modified}`);
    console.log(`${'═'.repeat(60)}\n`);

    return res.status(200).json({
      success: true,
      message: `Importación completada: ${results.success}/${results.total} productos`,
      results,
    });
  } catch (err) {
    console.error('❌ Error en ml-import:', err);
    return res.status(500).json({
      error: 'Error al importar productos de MercadoLibre',
      message: err.message,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  }
}
