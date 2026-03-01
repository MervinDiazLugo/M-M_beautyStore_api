# 🛍️ Shop API - CRUD Next.js + MongoDB 

## Resumen

API REST completa para gestionar productos con integración automática de scraping desde Mercado Libre.

### Endpoints CRUD Principales
- **GET** `/api/items` — Lista todos los productos
- **POST** `/api/items` — Crea un producto
- **GET** `/api/items/[id]` — Obtiene un producto por ID
- **PUT** `/api/items/[id]` — Actualiza un producto
- **PATCH** `/api/items/[id]` — Actualización parcial
- **DELETE** `/api/items/[id]` — Elimina un producto

### Endpoints de Importación & Mantenimiento
- **POST** `/api/maintenance/import` — Importa datos JSON
- **POST** `/api/maintenance/ml-import` — Importa desde Mercado Libre (con validación ML)
- **POST** `/api/maintenance/normalize` — Sanitiza caracteres UTF-8 inválidos
- **GET** `/api/maintenance/health` — Verifica integridad de la BD

### Scripts Unificados
Un único script maneja todo el mantenimiento:
```bash
npm run maintenance [comando] [opciones]
```

## ⚡ Inicio Rápido

### Instalación local

1. Clona o copia el proyecto
2. Instala dependencias:
   ```bash
   npm install
   ```
3. Crea `.env.local` en la raíz:
   ```env
   MONGODB_URI="mongodb+srv://usuario:password@cluster0.mongodb.net/db?retryWrites=true&w=majority"
   MONGODB_DB="mi_db"  # Opcional
   ```
4. Ejecuta el servidor:
   ```bash
   npm run dev
   ```
   API disponible en: `http://localhost:3000/api/items`
   Swagger UI: `http://localhost:3000/api/swagger`


### Script Unificado de Mantenimiento

Un único script maneja toda la lógica de mantenimiento de BD:

```bash
# Importar JSON a MongoDB (limpia, sanitiza, inserta con upsert)
npm run maintenance import [ruta/archivo.json]
npm run maintenance import productos_final.json
npm run maintenance import data/productos_clean.json

# Normalizar caracteres UTF-8 (en caso de errores)
npm run maintenance normalize

# Test de integridad (verifica lectura sin errores BSON)
npm run maintenance test

# Limpiar toda la colección (CUIDADO: sin confirmación)
npm run maintenance clean

# Recrear índices automáticamente
npm run maintenance index
```

**Ejemplo flujo típico:**
```bash
npm run maintenance import productos_final.json
npm run maintenance test
```

## 🌐 Integración con Scraper de Mercado Libre

### Automatización Completa

El proyecto incluye `mercadolibre_scraper.py` que automatiza el scraping y la importación:

```bash
python mercadolibre_scraper.py
```

**El script:**
1. Lee IDs de `scraping_ml.txt` (URLs o códigos ML)
2. Consulta API de Mercado Libre para obtener datos de productos
3. Descarga imágenes automáticamente
4. Genera: `productos_final.json`, `PRODUCTS.js`, Excel (opcional)
5. **Importa automáticamente a tu BD** vía HTTP POST

### Configuración del Scraper

**1. Crear archivo de IDs** (`scraping_ml.txt`):
```
# URLs o códigos de Mercado Libre
https://articulo.mercadolibre.com.ar/MLA1234567
MLAU1234567890
1234567890
```

**2. Configurar credenciales** (opcional, en `.env` del proyecto):
```env
# Variables para el scraper Python
MERCADOLIBRE_CLIENT_ID=tu_client_id
MERCADOLIBRE_CLIENT_SECRET=tu_secret
SHOP_API_URL=http://localhost:3000/api/maintenance/ml-import
AUTO_IMPORT=true
```

**3. Instalar dependencias Python** (opcional):
```bash
pip install requests pandas  # pandas solo si quieres Excel
```

**4. Ejecutar scraper:**
```bash
# Modo automático (genera archivos + importa a API)
python mercadolibre_scraper.py

# O solo generar JSON (sin AUTO_IMPORT)
# Luego importar manualmente:
npm run maintenance import productos_final.json
```

### Flujo de Datos

```
Mercado Libre
     ↓
Python Scraper (mercadolibre_scraper.py)
     ├─ Descarga datos + imágenes
     ├─ Genera: productos_final.json
     └─ POST → /api/maintenance/ml-import
              ↓
         Node.js/MongoDB
              ↓
         Sanitización automática
         Validación ML
         Upsert (sin duplicados)
              ↓
         Base de Datos lista
```

### Endpoint `/api/maintenance/ml-import`

**POST** — Importa productos de Mercado Libre con validación específica

**Request:**
```bash
curl -X POST http://localhost:3000/api/maintenance/ml-import \
  -H "Content-Type: application/json" \
  -d @productos_final.json
```

O enviar directamente:
```bash
curl -X POST http://localhost:3000/api/maintenance/ml-import \
  -H "Content-Type: application/json" \
  -d '{
    "data": [
      {
        "id": "MLAU1234567",
        "name": "Producto...",
        "ml_price": 5000,
        "price": 4000,
        ...
      }
    ]
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Importación completada: 156 productos procesados",
  "results": {
    "total": 156,
    "success": 155,
    "failed": 1,
    "upserted": 140,
    "modified": 15,
    "errors": [
      {
        "id": "unknown",
        "errors": ["Campo requerido: id"]
      }
    ]
  }
}
```

**Validación automática:**
- ✅ Sanitiza caracteres UTF-8 inválidos
- ✅ Normaliza Unicode a NFC
- ✅ Valida campos mínimos (id, name, price)
- ✅ Enriquece con valores por defecto si faltan
- ✅ Usa `bulkWrite` con `upsert` (no duplica por `id`)
- ✅ Crea índices automáticamente

## 🔧 Resolución de Problemas

### Error: "Invalid UTF-8 string in BSON document"
**Causa:** Caracteres UTF-8 inválidos en los datos  
**Solución:** Usa el endpoint/script de normalización:
```bash
npm run maintenance normalize
```

### Puerto 3000 ya en uso
```bash
Get-Process -Name "node" | Stop-Process -Force  # PowerShell
# o en macOS/Linux: pkill -f "node"
```

### La API no se conecta a MongoDB
Verifica:
1. Variable de entorno `MONGODB_URI` está correctamente en `.env.local`
2. La URI es válida (desde MongoDB Atlas)
3. Tu IP está en la whitelist de MongoDB Atlas

### Importación lenta o timeouts
- Aumenta el timeout: Usa `npm run maintenance import [archivo]` que es más robusto
- Si usas HTTP POST, verifica la velocidad de conexión
- Considera importar en lotes pequeños

## 📁 Estructura del Proyecto

```
shop_api/
├── pages/
│   ├── _app.js                {aplicación Next.js}
│   ├── docs.js               {documentación}
│   ├── index.js              {página de inicio}
│   └── api/
│       ├── swagger.js        {UI de Swagger}
│       ├── items/
│       │   └── index.js      {CRUD: GET, POST, PUT, DELETE}
│       └── maintenance/
│           ├── health.js     {estado de BD}
│           ├── import.js     {POST JSON genérico}
│           ├── ml-import.js  {POST Mercado Libre (validado)}
│           └── normalize.js  {POST sanitización}
├── lib/
│   └── mongodb.js            {conexión a MongoDB}
├── scripts/
│   └── maintenance.js        {CLI: import, normalize, test, clean, index}
├── data/
│   └── *.json               {ejemplos de datos}
├── public/
│   └── openapi.json         {definición OpenAPI/Swagger}
├── mercadolibre_scraper.py  {scraper Python automático}
├── package.json
├── .env.local               {variables de entorno locales}
└── README.md
```

## 💡 Notas Importantes

- **MongoDB:** Los documentos se guardan con `_id` automático de MongoDB + campo `id` personalizado
- **Índices:** Se crean automáticamente al importar la primera vez
- **Sanitización:** Es automática - elimina caracteres inválidos UTF-8 y normaliza Unicode
- **Upsert:** Los datos se insertan sin duplicar - si el `id` existe, se actualiza
- **Imágenes:** El scraper descargar automáticamente a carpeta `productos/`
- **Vercel/Producción:** Cambia `MONGODB_URI` a la de producción en variables de entorno

## 🚀 Flujo de Trabajo Típico

```bash
# 1. Instalar
npm install

# 2. Configurar .env.local con credenciales de MongoDB

# 3. Iniciar servidor de desarrollo
npm run dev

# 4. (Opción A) Usar scraper Python
python mercadolibre_scraper.py
# Esto genera archivos y importa automáticamente

# 5. (Opción B) O importar JSON manualmente
npm run maintenance import productos_final.json

# 6. Verificar integridad
npm run maintenance test

# 7. Si hay errores UTF-8
npm run maintenance normalize

# 8. Acceder al API
# Swagger UI: http://localhost:3000/api/swagger
# CRUD Productos: http://localhost:3000/api/items
```

## 📚 Referencias

- [Documentación MongoDB](https://docs.mongodb.com/)
- [API Next.js](https://nextjs.org/docs/api-routes/introduction)
- [Mercado Libre Developers](https://developers.mercadolibre.com/)
- Swagger UI incorporada: `/api/swagger`

---

**Última actualización:** Febrero 2026  
**Versión:** 1.0.0 (Consolidado + Integración ML)

