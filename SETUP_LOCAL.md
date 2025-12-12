# 🖥️ Configuración Local - PostgreSQL en Windows

## Opción A: PostgreSQL Nativo (Recomendado)

### 1. Descargar PostgreSQL

1. Ve a: https://www.postgresql.org/download/windows/
2. Descarga el instalador (versión 15 o 16)
3. Ejecuta el instalador

### 2. Durante la instalación

- **Contraseña superusuario**: `password` (o la que prefieras)
- **Puerto**: `5432` (por defecto)
- **Locale**: Default
- ✅ Marca "Stack Builder" si quieres herramientas adicionales

### 3. Crear la base de datos

Abre **pgAdmin 4** (se instala con PostgreSQL) o usa la terminal:

```bash
# Abrir SQL Shell (psql) desde el menú de Windows
# Login con usuario postgres y tu contraseña

# Crear la base de datos
CREATE DATABASE sports_booking_db;

# Verificar
\l
```

### 4. Configurar el .env

```env
# Ya está configurado en tu .env:
DB_NAME=sports_booking_db
DB_USER=postgres
DB_PASSWORD=password
DB_HOST=localhost
DB_PORT=5432
```

### 5. Inicializar las tablas

```bash
cd sports-booking-backend
npm run db:sync
```

### 6. (Opcional) Cargar datos de prueba

```bash
npm run db:init
```

### 7. Iniciar el servidor

```bash
npm run dev
```

---

## Opción B: Docker (Más fácil, sin instalar PostgreSQL)

### 1. Instalar Docker Desktop

1. Ve a: https://www.docker.com/products/docker-desktop/
2. Descarga e instala Docker Desktop para Windows
3. Reinicia tu PC si te lo pide

### 2. Crear docker-compose.yml

Ya existe en tu proyecto. Ejecuta:

```bash
cd sports-booking-backend
docker-compose up -d
```

### 3. Verificar que PostgreSQL está corriendo

```bash
docker ps
```

Deberías ver un contenedor `postgres` corriendo.

### 4. Continuar con pasos 5-7 de la Opción A

---

## Verificar que todo funciona

### 1. Probar conexión a la base de datos

```bash
npm run dev
```

Deberías ver:
```
✅ Database connection established successfully.
🚀 Server running on port 8001
```

### 2. Probar el health check

Abre en tu navegador:
```
http://localhost:8001/health
```

Deberías ver:
```json
{
  "status": "OK",
  "timestamp": "2024-...",
  "environment": "development"
}
```

### 3. Probar el frontend

```bash
cd ../sports-booking-platform
npm run dev
```

Abre: http://localhost:4555

---

## Troubleshooting

### Error: ECONNREFUSED 127.0.0.1:5432

PostgreSQL no está corriendo. Verifica:

**Windows:**
1. Abre "Servicios" (busca "services.msc")
2. Busca "postgresql-x64-XX"
3. Click derecho → Iniciar

**Docker:**
```bash
docker-compose up -d
```

### Error: password authentication failed

La contraseña en `.env` no coincide con la de PostgreSQL.

1. Abre pgAdmin
2. Click derecho en el servidor → Properties → Connection
3. Verifica la contraseña
4. Actualiza `.env` con la contraseña correcta

### Error: database "sports_booking_db" does not exist

```bash
# Usando psql
psql -U postgres
CREATE DATABASE sports_booking_db;
\q
```

O en pgAdmin: Click derecho en "Databases" → Create → Database

### Error: relation "users" does not exist

Las tablas no se han creado:

```bash
npm run db:sync
```

---

## Comandos útiles

```bash
# Iniciar servidor en desarrollo
npm run dev

# Sincronizar tablas (crear/actualizar)
npm run db:sync

# Inicializar con datos de prueba
npm run db:init

# Ver logs de Docker
docker-compose logs -f

# Parar Docker
docker-compose down

# Reiniciar todo en Docker
docker-compose down && docker-compose up -d
```
