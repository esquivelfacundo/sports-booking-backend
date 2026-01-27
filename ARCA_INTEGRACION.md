# 🧾 INTEGRACIÓN ARCA/AFIP - FACTURACIÓN ELECTRÓNICA

> **DOCUMENTO MAESTRO DE IMPLEMENTACIÓN**  
> Última actualización: 27/01/2026  
> Estado: EN PROGRESO

---

## ⚠️ ADVERTENCIAS CRÍTICAS

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║  ESTE MÓDULO EMITE COMPROBANTES FISCALES REALES CON VALIDEZ LEGAL            ║
║  UN ERROR PUEDE GENERAR PROBLEMAS FISCALES GRAVES PARA LOS ESTABLECIMIENTOS  ║
║  VERIFICAR CADA LÍNEA DE CÓDIGO - NO HAY MARGEN PARA ERRORES                 ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

### Consecuencias de Errores
- **CAE duplicado**: Multas de AFIP
- **Factura mal emitida**: Debe anularse con NC (no se puede borrar)
- **Certificados comprometidos**: Responsabilidad legal del contribuyente
- **Montos incorrectos**: Declaraciones juradas erróneas

---

## 📋 ÍNDICE

1. [Reglas Fundamentales](#1-reglas-fundamentales)
2. [Arquitectura Multi-Tenant](#2-arquitectura-multi-tenant)
3. [Tipos de Comprobantes](#3-tipos-de-comprobantes)
4. [Modelo de Datos](#4-modelo-de-datos)
5. [Servicios Backend](#5-servicios-backend)
6. [API Endpoints](#6-api-endpoints)
7. [Frontend - Configuración](#7-frontend---configuración)
8. [Frontend - Facturación](#8-frontend---facturación)
9. [Seguridad](#9-seguridad)
10. [Testing](#10-testing)
11. [Checklist de Implementación](#11-checklist-de-implementación)

---

## 1. REGLAS FUNDAMENTALES

### 1.1 Principios Inquebrantables

| # | Regla | Razón |
|---|-------|-------|
| 1 | **NUNCA hardcodear CUIT o credenciales** | Multi-tenant obligatorio |
| 2 | **SIEMPRE validar datos ANTES de enviar a AFIP** | No se pueden corregir errores |
| 3 | **SIEMPRE guardar respuesta completa de AFIP** | Auditoría y debugging |
| 4 | **NUNCA borrar comprobantes emitidos** | Solo anular con NC |
| 5 | **SIEMPRE encriptar certificados en BD** | Seguridad fiscal |
| 6 | **NUNCA exponer certificados al frontend** | Solo backend maneja AFIP |
| 7 | **SIEMPRE usar transacciones en BD** | Consistencia de datos |
| 8 | **NUNCA emitir sin verificar último número** | Evitar huecos/duplicados |

### 1.2 Flujo de Emisión (Inmutable)

```
1. Validar datos del comprobante
2. Obtener Token/Sign de WSAA (o usar cache válido)
3. Consultar último número autorizado en AFIP
4. Calcular próximo número = último + 1
5. Enviar solicitud FECAESolicitar
6. Verificar resultado === 'A' (Aprobado)
7. Guardar comprobante en BD con respuesta AFIP
8. Generar PDF con QR
9. Actualizar entidad relacionada (order/booking)
```

### 1.3 Reglas de Negocio AFIP

| Regla | Descripción |
|-------|-------------|
| **Correlatividad** | Números de comprobante deben ser consecutivos sin saltos |
| **Unicidad CAE** | Cada CAE es único e irrepetible |
| **Vencimiento CAE** | El CAE tiene fecha de vencimiento (10 días) |
| **Asociación NC** | Toda NC debe referenciar el comprobante original |
| **Condición IVA** | El tipo de factura depende de la condición del emisor Y receptor |

---

## 2. ARQUITECTURA MULTI-TENANT

### 2.1 Aislamiento de Datos

```
┌─────────────────────────────────────────────────────────────────┐
│                     PLATAFORMA CENTRAL                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ Establecimiento │  │ Establecimiento │  │ Establecimiento │ │
│  │       A         │  │       B         │  │       C         │ │
│  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤ │
│  │ CUIT: 20-XXX-1  │  │ CUIT: 27-YYY-2  │  │ CUIT: 30-ZZZ-3  │ │
│  │ Cert: [encript] │  │ Cert: [encript] │  │ Cert: [encript] │ │
│  │ PtoVta: 1, 2    │  │ PtoVta: 1       │  │ PtoVta: 1, 3, 5 │ │
│  │ Cond: Monotrib  │  │ Cond: RI        │  │ Cond: RI        │ │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘ │
│           │                    │                    │          │
│           ▼                    ▼                    ▼          │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              SERVICIO ARCA MULTI-TENANT                     ││
│  │  - Carga credenciales por establishmentId                   ││
│  │  - Cache Token/Sign por establishmentId                     ││
│  │  - Aislamiento total entre establecimientos                 ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    AFIP (WSAA + WSFEv1)                     ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Cache de Credenciales

```javascript
// Estructura del cache por establecimiento
tokenCache = {
  "establishment-uuid-1": {
    token: "...",
    sign: "...",
    expiresAt: Date,
    cuit: "20XXXXXXXX1"
  },
  "establishment-uuid-2": {
    token: "...",
    sign: "...",
    expiresAt: Date,
    cuit: "27YYYYYYYY2"
  }
}
```

**Reglas de Cache:**
- TTL: 11 horas (AFIP da 12h, dejamos margen)
- Invalidar si falla autenticación
- Un cache por establishmentId, NO global

---

## 3. TIPOS DE COMPROBANTES

### 3.1 Facturas Soportadas

| Código | Nombre | Emisor | Receptor | Uso |
|--------|--------|--------|----------|-----|
| 1 | Factura A | Resp. Inscripto | Resp. Inscripto | B2B con discriminación IVA |
| 6 | Factura B | Resp. Inscripto | CF/Monotrib/Exento | B2C sin discriminación IVA |
| 11 | Factura C | Monotributista | Cualquiera | Monotributistas |

### 3.2 Notas de Crédito Soportadas

| Código | Nombre | Anula |
|--------|--------|-------|
| 3 | NC A | Factura A |
| 8 | NC B | Factura B |
| 13 | NC C | Factura C |

### 3.3 Matriz de Decisión de Tipo

```
┌─────────────────────────────────────────────────────────────────┐
│              EMISOR (Establecimiento)                           │
├────────────────────┬────────────────────────────────────────────┤
│                    │           RECEPTOR (Cliente)               │
│                    ├──────────────┬──────────────┬──────────────┤
│                    │     RI       │  Monotrib    │     CF       │
├────────────────────┼──────────────┼──────────────┼──────────────┤
│ Resp. Inscripto    │  Factura A   │  Factura B   │  Factura B   │
├────────────────────┼──────────────┼──────────────┼──────────────┤
│ Monotributista     │  Factura C   │  Factura C   │  Factura C   │
└────────────────────┴──────────────┴──────────────┴──────────────┘
```

### 3.4 Tipos de Documento del Receptor

| Código | Nombre | Cuándo usar |
|--------|--------|-------------|
| 80 | CUIT | Empresas / RI |
| 86 | CUIL | Personas con CUIL |
| 96 | DNI | Personas con DNI |
| 99 | Consumidor Final | Sin identificar (ventas menores) |

**Regla AFIP para DocTipo 99:**
- Si DocTipo = 99, entonces DocNro DEBE ser 0
- Solo válido para Factura B y C
- Factura A SIEMPRE requiere CUIT (código 80)

---

## 4. MODELO DE DATOS

### 4.1 Tabla: establishment_afip_configs

```sql
CREATE TABLE establishment_afip_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  
  -- Datos Fiscales
  cuit VARCHAR(11) NOT NULL,
  razon_social VARCHAR(255) NOT NULL,
  domicilio_fiscal VARCHAR(500) NOT NULL,
  condicion_fiscal VARCHAR(50) NOT NULL CHECK (condicion_fiscal IN ('monotributista', 'responsable_inscripto')),
  inicio_actividades DATE NOT NULL,
  
  -- Certificados ENCRIPTADOS (AES-256)
  encrypted_cert TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  cert_expiration DATE, -- Fecha vencimiento del certificado
  
  -- Estado
  is_active BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false, -- true después de test exitoso
  last_tested_at TIMESTAMP WITH TIME ZONE,
  last_test_result JSONB, -- Guardar resultado del último test
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by_id UUID REFERENCES users(id),
  updated_by_id UUID REFERENCES users(id),
  
  -- Constraints
  UNIQUE(establishment_id), -- Solo una config por establecimiento
  UNIQUE(cuit) -- Un CUIT no puede estar en dos establecimientos
);

CREATE INDEX idx_afip_configs_establishment ON establishment_afip_configs(establishment_id);
CREATE INDEX idx_afip_configs_cuit ON establishment_afip_configs(cuit);
```

### 4.2 Tabla: establishment_afip_puntos_venta

```sql
CREATE TABLE establishment_afip_puntos_venta (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  afip_config_id UUID NOT NULL REFERENCES establishment_afip_configs(id) ON DELETE CASCADE,
  
  -- Datos del Punto de Venta
  numero INTEGER NOT NULL CHECK (numero > 0 AND numero <= 99999),
  descripcion VARCHAR(100), -- "Caja Principal", "Kiosco", etc.
  
  -- Estado
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(afip_config_id, numero) -- No repetir número en mismo CUIT
);

CREATE INDEX idx_puntos_venta_establishment ON establishment_afip_puntos_venta(establishment_id);
CREATE INDEX idx_puntos_venta_config ON establishment_afip_puntos_venta(afip_config_id);
```

### 4.3 Tabla: invoices (Comprobantes Emitidos)

```sql
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  establishment_id UUID NOT NULL REFERENCES establishments(id),
  afip_config_id UUID NOT NULL REFERENCES establishment_afip_configs(id),
  punto_venta_id UUID NOT NULL REFERENCES establishment_afip_puntos_venta(id),
  
  -- Datos AFIP (INMUTABLES después de emitir)
  cae VARCHAR(14) NOT NULL,
  cae_vencimiento DATE NOT NULL,
  tipo_comprobante INTEGER NOT NULL, -- 1, 6, 11, 3, 8, 13
  tipo_comprobante_nombre VARCHAR(50) NOT NULL,
  numero_comprobante INTEGER NOT NULL,
  punto_venta INTEGER NOT NULL,
  fecha_emision DATE NOT NULL,
  
  -- Montos
  importe_total DECIMAL(12,2) NOT NULL,
  importe_neto DECIMAL(12,2) NOT NULL,
  importe_iva DECIMAL(12,2) DEFAULT 0,
  importe_tributos DECIMAL(12,2) DEFAULT 0,
  
  -- Cliente/Receptor
  cliente_nombre VARCHAR(255),
  cliente_doc_tipo INTEGER NOT NULL, -- 80, 86, 96, 99
  cliente_doc_nro VARCHAR(20) NOT NULL,
  cliente_condicion_iva INTEGER, -- 1=RI, 4=Exento, 5=CF, 6=Monotrib
  
  -- Items (JSONB para flexibilidad)
  items JSONB NOT NULL DEFAULT '[]',
  /*
  Estructura de items:
  [
    {
      "descripcion": "Alquiler Cancha 1 - 18:00 a 19:00",
      "cantidad": 1,
      "precioUnitario": 5000,
      "subtotal": 5000
    },
    {
      "descripcion": "Agua mineral x2",
      "cantidad": 2,
      "precioUnitario": 500,
      "subtotal": 1000
    }
  ]
  */
  
  -- Relaciones con entidades facturadas
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  
  -- Para Notas de Crédito: referencia al comprobante original
  comprobante_asociado_id UUID REFERENCES invoices(id),
  motivo_nc VARCHAR(500), -- Solo para NC
  
  -- Estado
  status VARCHAR(20) DEFAULT 'emitido' CHECK (status IN ('emitido', 'anulado')),
  anulado_por_id UUID REFERENCES invoices(id), -- NC que anuló esta factura
  
  -- PDF
  pdf_url VARCHAR(500),
  pdf_generated_at TIMESTAMP WITH TIME ZONE,
  
  -- Respuesta AFIP completa (para auditoría)
  afip_response JSONB NOT NULL,
  
  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by_id UUID REFERENCES users(id),
  
  -- Constraints
  UNIQUE(afip_config_id, tipo_comprobante, punto_venta, numero_comprobante)
);

CREATE INDEX idx_invoices_establishment ON invoices(establishment_id);
CREATE INDEX idx_invoices_cae ON invoices(cae);
CREATE INDEX idx_invoices_order ON invoices(order_id);
CREATE INDEX idx_invoices_booking ON invoices(booking_id);
CREATE INDEX idx_invoices_fecha ON invoices(fecha_emision);
CREATE INDEX idx_invoices_tipo ON invoices(tipo_comprobante);
CREATE INDEX idx_invoices_status ON invoices(status);
```

### 4.4 Modificar Tablas Existentes

```sql
-- Agregar columna invoice_id a orders
ALTER TABLE orders ADD COLUMN invoice_id UUID REFERENCES invoices(id);
CREATE INDEX idx_orders_invoice ON orders(invoice_id);

-- Agregar columna invoice_id a bookings
ALTER TABLE bookings ADD COLUMN invoice_id UUID REFERENCES invoices(id);
CREATE INDEX idx_bookings_invoice ON bookings(invoice_id);
```

---

## 5. SERVICIOS BACKEND

### 5.1 Estructura de Archivos

```
src/
├── models/
│   ├── EstablishmentAfipConfig.js    ← NUEVO
│   ├── EstablishmentAfipPuntoVenta.js ← NUEVO
│   └── Invoice.js                     ← NUEVO
│
├── services/
│   └── arca/
│       ├── index.js           ← Factory para obtener servicio por establishment
│       ├── wsaaService.js     ← Autenticación WSAA multi-tenant
│       ├── wsfeService.js     ← Facturación WSFEv1 multi-tenant
│       ├── pdfService.js      ← Generación de PDF con QR
│       └── encryptionService.js ← Encriptar/desencriptar certificados
│
├── controllers/
│   └── arca/
│       ├── configController.js    ← CRUD config AFIP
│       ├── facturaController.js   ← Emitir facturas
│       └── ncController.js        ← Emitir notas de crédito
│
└── routes/
    └── arca.js                    ← Todas las rutas ARCA
```

### 5.2 ARCAServiceFactory (Patrón Factory)

```javascript
// src/services/arca/index.js
class ARCAServiceFactory {
  static instances = new Map();
  
  static async getService(establishmentId) {
    // Verificar cache
    if (this.instances.has(establishmentId)) {
      return this.instances.get(establishmentId);
    }
    
    // Cargar configuración
    const config = await EstablishmentAfipConfig.findOne({
      where: { establishmentId, isActive: true }
    });
    
    if (!config) {
      throw new Error('Establecimiento no tiene configuración AFIP activa');
    }
    
    // Crear instancia con credenciales desencriptadas
    const service = new ARCAService(config);
    this.instances.set(establishmentId, service);
    
    return service;
  }
  
  static invalidateCache(establishmentId) {
    this.instances.delete(establishmentId);
  }
}
```

### 5.3 Encryption Service

```javascript
// src/services/arca/encryptionService.js
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ARCA_ENCRYPTION_KEY, 'hex'); // 32 bytes

export function encryptCertificate(plaintext) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    content: encrypted
  };
}

export function decryptCertificate(encrypted) {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    KEY,
    Buffer.from(encrypted.iv, 'hex')
  );
  
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'hex'));
  
  let decrypted = decipher.update(encrypted.content, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
```

---

## 6. API ENDPOINTS

### 6.1 Configuración AFIP

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/arca/config` | Obtener config del establecimiento |
| POST | `/api/arca/config` | Crear/actualizar config AFIP |
| POST | `/api/arca/config/test` | Probar conexión con AFIP |
| DELETE | `/api/arca/config` | Eliminar config (solo si no hay facturas) |

### 6.2 Puntos de Venta

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/arca/puntos-venta` | Listar puntos de venta |
| POST | `/api/arca/puntos-venta` | Agregar punto de venta |
| PUT | `/api/arca/puntos-venta/:id` | Actualizar punto de venta |
| DELETE | `/api/arca/puntos-venta/:id` | Desactivar punto de venta |
| POST | `/api/arca/puntos-venta/sync` | Sincronizar con AFIP |

### 6.3 Facturación

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/arca/factura/emitir` | Emitir factura |
| POST | `/api/arca/nota-credito/emitir` | Emitir nota de crédito |
| GET | `/api/arca/comprobantes` | Listar comprobantes |
| GET | `/api/arca/comprobantes/:id` | Detalle de comprobante |
| GET | `/api/arca/comprobantes/:id/pdf` | Descargar PDF |
| GET | `/api/arca/estadisticas` | Estadísticas de facturación |

### 6.4 Request/Response Examples

**POST /api/arca/factura/emitir**
```json
// Request
{
  "puntoVentaId": "uuid-punto-venta",
  "cliente": {
    "nombre": "Juan Pérez",
    "docTipo": 96,  // DNI
    "docNro": "12345678",
    "condicionIva": 5  // Consumidor Final
  },
  "items": [
    {
      "descripcion": "Alquiler Cancha 1 - 18:00 a 19:00",
      "cantidad": 1,
      "precioUnitario": 5000
    },
    {
      "descripcion": "Agua mineral",
      "cantidad": 2,
      "precioUnitario": 500
    }
  ],
  "orderId": "uuid-order",  // opcional
  "bookingId": "uuid-booking"  // opcional
}

// Response
{
  "success": true,
  "data": {
    "id": "uuid-invoice",
    "cae": "12345678901234",
    "caeVencimiento": "2026-02-06",
    "tipoComprobante": 11,
    "tipoComprobanteNombre": "Factura C",
    "numeroComprobante": 1,
    "puntoVenta": 1,
    "fechaEmision": "2026-01-27",
    "importeTotal": 6000,
    "cliente": { ... },
    "items": [ ... ],
    "pdfUrl": "/api/arca/comprobantes/uuid/pdf"
  }
}
```

---

## 7. FRONTEND - CONFIGURACIÓN

### 7.1 Nueva Sección en Integraciones

```
Integraciones
├── OpenAI (existente)
├── WhatsApp (existente)
├── MercadoPago (existente)
└── Facturación AFIP/ARCA ← NUEVO
```

### 7.2 Pantalla de Configuración

```
┌─────────────────────────────────────────────────────────────────┐
│  FACTURACIÓN ELECTRÓNICA AFIP                                   │
│  ═══════════════════════════════════════════════════════════    │
│                                                                 │
│  Estado: ○ No configurado / ● Activo                           │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  DATOS FISCALES                                          │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │  CUIT:              [20-XXXXXXXX-X        ]              │   │
│  │  Razón Social:      [Mi Establecimiento S.R.L.    ]      │   │
│  │  Domicilio Fiscal:  [Av. Siempreviva 742, CABA    ]      │   │
│  │  Condición Fiscal:  [● Monotributista ○ Resp. Inscripto] │   │
│  │  Inicio Actividades:[01/01/2020                   ]      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  CERTIFICADOS AFIP                                       │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │  Certificado (.crt): [Seleccionar archivo...] ✓ Cargado  │   │
│  │  Clave Privada (.key):[Seleccionar archivo...] ✓ Cargado │   │
│  │                                                          │   │
│  │  ⚠️ Los certificados se guardan encriptados             │   │
│  │  📘 Ver guía: ¿Cómo obtener certificados?               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  PUNTOS DE VENTA                                         │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │  #  │ Descripción     │ Predeterminado │ Acciones       │   │
│  │  1  │ Caja Principal  │      ●         │ [Editar][×]    │   │
│  │  2  │ Kiosco          │      ○         │ [Editar][×]    │   │
│  │                                                          │   │
│  │  [+ Agregar Punto de Venta]  [↻ Sincronizar con AFIP]   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [Guardar Configuración]  [Probar Conexión]                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. FRONTEND - FACTURACIÓN

### 8.1 Indicador en Tabla de Ventas

```
┌──────────────────────────────────────────────────────────────────────────┐
│  VENTAS                                                    [+ Nueva] [↓] │
├──────┬──────────────┬─────────────┬──────────┬────────┬─────────────────┤
│ Nro  │ Fecha        │ Cliente     │ Total    │ Estado │ AFIP            │
├──────┼──────────────┼─────────────┼──────────┼────────┼─────────────────┤
│ 001  │ 27/01 14:30  │ Juan Pérez  │ $6.000   │ Pagado │ ✅ FC-C 0001    │
│ 002  │ 27/01 15:00  │ María López │ $8.500   │ Pagado │ ⚪ Sin facturar │
│ 003  │ 27/01 16:30  │ Carlos Ruiz │ $4.200   │ Pagado │ ⚪ Sin facturar │
└──────┴──────────────┴─────────────┴──────────┴────────┴─────────────────┘
```

### 8.2 Sidebar de Venta con Botón Facturar

```
┌─────────────────────────────────────┐
│  DETALLE DE VENTA #002              │
│  ═══════════════════════════════    │
│                                     │
│  Cliente: María López               │
│  Fecha: 27/01/2026 15:00           │
│  Estado: Pagado                     │
│                                     │
│  ──────────────────────────────     │
│  Items:                             │
│  • Cancha 2 - 15:00 a 16:00  $5000 │
│  • Bebidas x3                $1500 │
│  • Snacks x2                 $2000 │
│  ──────────────────────────────     │
│  TOTAL:                     $8.500 │
│                                     │
│  ──────────────────────────────     │
│  FACTURACIÓN:                       │
│  ⚪ Sin facturar                    │
│                                     │
│  [🧾 FACTURAR]                      │
│                                     │
└─────────────────────────────────────┘
```

### 8.3 Modal de Facturación

```
┌─────────────────────────────────────────────────────────────┐
│  EMITIR FACTURA                                        [×]  │
│  ═══════════════════════════════════════════════════════    │
│                                                             │
│  ⚠️ ATENCIÓN: Esta operación emitirá un comprobante       │
│     fiscal REAL con validez legal ante AFIP.               │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  TIPO DE FACTURA                                     │   │
│  │  [Factura C ▼] (según condición fiscal)             │   │
│  │                                                      │   │
│  │  PUNTO DE VENTA                                      │   │
│  │  [1 - Caja Principal ▼]                             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  DATOS DEL CLIENTE                                   │   │
│  │                                                      │   │
│  │  Tipo Doc:  [○ CF  ○ DNI  ○ CUIT]                   │   │
│  │  Nro Doc:   [________________]                      │   │
│  │  Nombre:    [María López        ]                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  DETALLE                                             │   │
│  │  ─────────────────────────────────────────────────   │   │
│  │  Cancha 2 - 15:00 a 16:00          1 x $5000 $5000  │   │
│  │  Bebidas                            3 x $500  $1500  │   │
│  │  Snacks                             2 x $1000 $2000  │   │
│  │  ─────────────────────────────────────────────────   │   │
│  │  TOTAL:                                      $8.500  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [Cancelar]                    [EMITIR FACTURA →]          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. SEGURIDAD

### 9.1 Checklist de Seguridad

- [ ] Certificados encriptados con AES-256-GCM
- [ ] Clave de encriptación en variable de entorno (no en código)
- [ ] Certificados NUNCA expuestos a frontend
- [ ] Validación de permisos por establecimiento en cada request
- [ ] Rate limiting en endpoints de emisión
- [ ] Logs de auditoría para todas las operaciones AFIP
- [ ] Backup de respuestas AFIP en campo JSONB

### 9.2 Variables de Entorno Requeridas

```env
# Clave para encriptar certificados AFIP (32 bytes hex = 64 caracteres)
ARCA_ENCRYPTION_KEY=a1b2c3d4e5f6... (64 caracteres hex)

# URLs AFIP Producción (fijas, no cambiar)
AFIP_WSAA_URL=https://wsaa.afip.gov.ar/ws/services/LoginCms
AFIP_WSFE_URL=https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL
```

---

## 10. TESTING

### 10.1 Tests Unitarios

- [ ] Encriptación/desencriptación de certificados
- [ ] Validación de CUIT (formato y dígito verificador)
- [ ] Cálculo de tipos de comprobante según condición fiscal
- [ ] Formateo de fechas AFIP (YYYYMMDD)
- [ ] Validación de items de factura

### 10.2 Tests de Integración

- [ ] Flujo completo de emisión de factura
- [ ] Flujo completo de emisión de NC
- [ ] Manejo de errores AFIP
- [ ] Cache de tokens por establecimiento
- [ ] Generación de PDF

### 10.3 Tests E2E

- [ ] Configuración AFIP desde UI
- [ ] Emisión de factura desde sidebar de venta
- [ ] Visualización de estado en tabla de ventas
- [ ] Descarga de PDF

---

## 11. CHECKLIST DE IMPLEMENTACIÓN

### FASE 1: Modelo de Datos
- [x] Crear migración para `establishment_afip_configs`
- [x] Crear migración para `establishment_afip_puntos_venta`
- [x] Crear migración para `invoices`
- [x] Crear migración para agregar `invoice_id` a `orders`
- [x] Crear migración para agregar `invoice_id` a `bookings`
- [x] Crear modelo Sequelize `EstablishmentAfipConfig`
- [x] Crear modelo Sequelize `EstablishmentAfipPuntoVenta`
- [x] Crear modelo Sequelize `Invoice`
- [x] Configurar asociaciones entre modelos

### FASE 2: Servicios Backend
- [x] Crear `encryptionService.js` para certificados
- [x] Crear `wsaaService.js` multi-tenant
- [x] Crear `wsfeService.js` multi-tenant (Facturas A, B, C)
- [x] Crear `notaCreditoService.js` multi-tenant (NC A, B, C)
- [x] Crear `pdfService.js` para generación de comprobantes
- [x] Crear `ARCAServiceFactory` para instanciar por establecimiento
- [x] Implementar cache de Token/Sign por establecimiento
- [ ] Tests unitarios de servicios

### FASE 3: API Endpoints
- [x] Crear `configController.js` - CRUD configuración
- [x] Crear `puntosVentaController.js` - CRUD puntos de venta
- [x] Crear `facturaController.js` - Emisión de facturas
- [x] Crear `ncController.js` - Emisión de notas de crédito
- [x] Crear `routes/arca.js` con todas las rutas
- [x] Registrar rutas en `app.js`
- [x] Middleware de validación de config activa
- [ ] Tests de integración de endpoints

### FASE 4: Frontend - Configuración
- [ ] Crear página `/admin/integraciones/afip`
- [ ] Componente `AfipConfigForm` - Datos fiscales
- [ ] Componente `CertificateUploader` - Subir certificados
- [ ] Componente `PuntosVentaList` - Gestión de puntos de venta
- [ ] Función `testConnection` - Probar conexión con AFIP
- [ ] Guardar estado de configuración en contexto
- [ ] Agregar enlace en menú de integraciones

### FASE 5: Frontend - Facturación
- [ ] Agregar columna "AFIP" en tabla de ventas (`orders`)
- [ ] Agregar columna "AFIP" en grilla de reservas (`bookings`)
- [ ] Crear `InvoiceStatusBadge` componente
- [ ] Crear `InvoiceModal` para emitir factura
- [ ] Botón "Facturar" en sidebar de venta
- [ ] Botón "Facturar" en sidebar de reserva
- [ ] Visualizador de comprobante emitido
- [ ] Botón de descarga de PDF
- [ ] Crear página `/admin/facturacion` - Listado de comprobantes

### FASE 6: Testing y Documentación
- [ ] Tests E2E con Playwright
- [ ] Documentar API en README
- [ ] Crear guía de configuración para usuarios
- [ ] Validar con un establecimiento de prueba

---

## 📝 NOTAS DE PROGRESO

### 27/01/2026
- Análisis completo del módulo ARCA original
- Definición de arquitectura multi-tenant
- Decisiones de diseño tomadas:
  - Certificados encriptados en BD (AES-256-GCM)
  - Solo ambiente producción
  - Factura manual (no automática)
  - Soporte para múltiples puntos de venta

### 27/01/2026 - Implementación Backend Completa
- ✅ **FASE 1 COMPLETADA**: Modelos y migraciones
  - Modelos Sequelize: `EstablishmentAfipConfig`, `EstablishmentAfipPuntoVenta`, `Invoice`
  - Migración SQL: `migrations/create_arca_tables.sql`
  - Asociaciones configuradas en `models/index.js`
  - Campos `invoiceId` agregados a `Order` y `Booking`

- ✅ **FASE 2 COMPLETADA**: Servicios backend multi-tenant
  - `src/services/arca/encryptionService.js` - AES-256-GCM
  - `src/services/arca/wsaaService.js` - Autenticación AFIP con cache
  - `src/services/arca/wsfeService.js` - Facturas A, B, C
  - `src/services/arca/notaCreditoService.js` - NC A, B, C
  - `src/services/arca/pdfService.js` - Generación de PDF con QR
  - `src/services/arca/arcaFactory.js` - Factory multi-tenant
  - `src/services/arca/index.js` - Exportaciones

- ✅ **FASE 3 COMPLETADA**: API REST
  - `src/routes/arca.js` con todos los endpoints
  - Rutas registradas en `app.js`
  - Dependencias agregadas: `soap`, `node-forge`, `pdfkit`

- ⏳ **PENDIENTE**: Frontend (Fases 4 y 5)

---

## 🔗 REFERENCIAS

- [Documentación WSAA AFIP](https://www.afip.gob.ar/ws/WSAA/README.txt)
- [Documentación WSFEv1 AFIP](https://www.afip.gob.ar/fe/documentos/manual_desarrollador_COMPG_v2_10.pdf)
- [Códigos de Comprobantes AFIP](https://www.afip.gob.ar/fe/documentos/TABLACOMPROBANTES.xls)
- [Generador de QR AFIP](https://www.afip.gob.ar/fe/qr/especificaciones.asp)
