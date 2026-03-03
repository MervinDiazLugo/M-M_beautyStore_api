# API de Gestión de Productos - M-M BeautyStore

API REST para gestión de productos de tienda online, integrada con MercadoLibre.

## Características

- CRUD completo de productos
- Importación automática desde MercadoLibre
- Autenticación mediante API Key
- Base de datos en Supabase (PostgreSQL)
- Documentación OpenAPI con Swagger UI

## Endpoints

### Endpoints Públicos (sin autenticación)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/items` | Listar todos los productos |
| GET | `/api/items/:id` | Obtener un producto por ID |
| GET | `/api/maintenance/health` | Verificar estado de la base de datos |

### Endpoints Protegidos (requieren header `x-api-key`)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/items` | Crear un nuevo producto |
| PUT | `/api/items/:id` | Actualizar producto (reemplazo completo) |
| PATCH | `/api/items/:id` | Actualizar producto (parcial) |
| DELETE | `/api/items/:id` | Eliminar un producto |
| POST | `/api/maintenance/ml-import` | Importar productos desde MercadoLibre |
| POST | `/api/maintenance/import` | Importar productos desde JSON |
| DELETE | `/api/maintenance/cleanup` | Eliminar todos los productos |

## Autenticación

Todos los endpoints protegidos requieren el header `x-api-key`:

```bash
curl -X POST https://tu-dominio/api/items \
  -H "Content-Type: application/json" \
  -H "x-api-key: TU_API_KEY" \
  -d '{"id":"MLA123","name":"Producto","price":100,"sku":"SKU001","published":true}'
```

Las API Keys se configuran en la variable de entorno `KEY_SECURITY_LIST` separadas por coma.

## Variables de Entorno

| Variable | Descripción |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anónima de Supabase |
| `KEY_SECURITY_LIST` | Lista de API Keys separadas por coma |
| `MERCADOLIBRE_CLIENT_ID` | Client ID de MercadoLibre |
| `MERCADOLIBRE_CLIENT_SECRET` | Client Secret de MercadoLibre |

## Estructura del Producto

```json
{
  "id": "MLA1510055959",
  "name": "Serum De Pestañas",
  "ml_price": 7105,
  "price": 6114,
  "precio_mayorista": 4891,
  "cantidad_minima_mayorista": 18,
  "cantidad_vendida": 1043,
  "sold_quantity_real": 118,
  "desc": "Descripción corta",
  "sku": "SKU001",
  "image": ["https://ejemplo.com/imagen1.jpg"],
  "envioGratis": false,
  "description": "Descripción completa del producto",
  "features": [],
  "specifications": {
    "Marca": "Bioaqua",
    "Modelo": "Serum de pestañas"
  },
  "mercadoLibreUrl": "https://mercadolibre.com.ar/MLA...",
  "brand": "Bioaqua",
  "condition": "new",
  "sold_quantity": 1043,
  "available_quantity": 9,
  "published": true,
  "permalink": "https://mercadolibre.com.ar/MLA..."
}
```

## Importar desde MercadoLibre

```bash
curl -X POST https://tu-dominio/api/maintenance/ml-import \
  -H "Content-Type: application/json" \
  -H "x-api-key: TU_API_KEY" \
  -d '{"ids":["MLA1510055959","MLA1519662745"]}'
```

## Desarrollo Local

```bash
# Instalar dependencias
npm install

# Ejecutar en desarrollo
npm run dev

# La API estará disponible en http://localhost:3000
```

## Swagger UI

Accede a `/api/swagger` para ver la documentación interactiva.

## Despliegue

1. Crear proyecto en Vercel
2. Importar repositorio de GitHub
3. Configurar variables de entorno
4. Desplegar

## Tecnologías

- Next.js 16
- Supabase (PostgreSQL)
- MercadoLibre API
