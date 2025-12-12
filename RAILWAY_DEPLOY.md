# 🚂 Guía de Despliegue en Railway

## Requisitos Previos
- Cuenta en [Railway](https://railway.app)
- Repositorio en GitHub con el código del backend

## Pasos para Desplegar

### 1. Crear Proyecto en Railway

1. Ve a [railway.app](https://railway.app) e inicia sesión
2. Click en **"New Project"**
3. Selecciona **"Deploy from GitHub repo"**
4. Autoriza Railway para acceder a tu repositorio
5. Selecciona el repositorio `sports-booking-backend`

### 2. Agregar Base de Datos PostgreSQL

1. En tu proyecto, click en **"+ New"**
2. Selecciona **"Database"** → **"Add PostgreSQL"**
3. Railway creará automáticamente la base de datos
4. La variable `DATABASE_URL` se inyectará automáticamente

### 3. Configurar Variables de Entorno

En el servicio del backend, ve a **"Variables"** y agrega:

```env
NODE_ENV=production
JWT_SECRET=<genera-una-clave-segura-de-32-caracteres>
JWT_REFRESH_SECRET=<genera-otra-clave-segura-de-32-caracteres>
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d
ADMIN_INIT_KEY=<tu-clave-admin-secreta>
FRONTEND_URL=https://tu-app.vercel.app
FRONTEND_PROD_URL=https://www.miscanchas.com
```

**Nota:** `DATABASE_URL` y `PORT` son inyectados automáticamente por Railway.

### 4. Configurar el Servicio

Railway detectará automáticamente:
- **Build Command:** `npm install`
- **Start Command:** `npm start`

Si no los detecta, configúralos manualmente en **Settings**.

### 5. Inicializar la Base de Datos

Después del primer deploy, necesitas crear las tablas:

1. Ve a tu servicio en Railway
2. Click en **"Settings"** → **"Deploy"**
3. Temporalmente cambia el **Start Command** a:
   ```
   npm run db:sync && npm start
   ```
4. Haz un redeploy
5. Una vez que las tablas estén creadas, vuelve a cambiar a:
   ```
   npm start
   ```

**Alternativa:** Usar Railway CLI
```bash
railway run npm run db:sync
```

### 6. Verificar el Deploy

1. Railway te dará una URL como `https://tu-proyecto.up.railway.app`
2. Verifica el health check: `https://tu-proyecto.up.railway.app/health`
3. Deberías ver:
   ```json
   {
     "status": "OK",
     "timestamp": "2024-...",
     "environment": "production"
   }
   ```

## Variables de Entorno Requeridas

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `NODE_ENV` | Entorno de ejecución | `production` |
| `DATABASE_URL` | URL de PostgreSQL (auto-inyectada) | `postgresql://...` |
| `JWT_SECRET` | Clave para firmar tokens JWT | `mi-clave-secreta-32-chars` |
| `JWT_REFRESH_SECRET` | Clave para refresh tokens | `otra-clave-secreta-32-chars` |
| `ADMIN_INIT_KEY` | Clave para inicializar admin | `admin-key-2024` |
| `FRONTEND_URL` | URL del frontend (Vercel) | `https://app.vercel.app` |
| `FRONTEND_PROD_URL` | URL de producción | `https://miscanchas.com` |

## Variables Opcionales

| Variable | Descripción |
|----------|-------------|
| `REDIS_URL` | URL de Redis (para caché) |
| `SMTP_*` | Configuración de email |
| `MERCADOPAGO_*` | Configuración de pagos |
| `CLOUDINARY_*` | Configuración de imágenes |

## Comandos Útiles

```bash
# Instalar Railway CLI
npm install -g @railway/cli

# Login
railway login

# Conectar a proyecto existente
railway link

# Ver logs
railway logs

# Ejecutar comando en producción
railway run npm run db:sync

# Abrir shell en producción
railway shell
```

## Troubleshooting

### Error: Connection Refused
- Verifica que PostgreSQL esté agregado al proyecto
- Verifica que `DATABASE_URL` esté configurada

### Error: SSL Required
- El código ya está configurado para usar SSL automáticamente con Railway

### Error: Port Already in Use
- Railway inyecta `PORT` automáticamente, no lo configures manualmente

## Actualizar Frontend

Después de desplegar el backend, actualiza el frontend:

1. En Vercel, ve a **Settings** → **Environment Variables**
2. Actualiza `NEXT_PUBLIC_API_URL` con la URL de Railway:
   ```
   NEXT_PUBLIC_API_URL=https://tu-proyecto.up.railway.app
   ```
3. Redeploy el frontend

## Estructura de Archivos para Railway

```
sports-booking-backend/
├── railway.json          # Configuración de Railway
├── Procfile              # Comando de inicio
├── package.json          # Scripts y dependencias
├── server.js             # Entry point
└── src/
    ├── app.js            # Express app
    ├── config/
    │   ├── database.js   # Configuración PostgreSQL (SSL auto)
    │   └── redis.js      # Redis opcional
    ├── controllers/      # Lógica de negocio
    ├── models/           # Modelos Sequelize
    ├── routes/           # Rutas API
    └── scripts/
        └── initDatabase.js  # Script de inicialización
```
