# 🌐 Configuración con Neon (PostgreSQL en la nube - GRATIS)

Neon ofrece PostgreSQL gratis en la nube. No necesitas instalar nada.

## 1. Crear cuenta en Neon

1. Ve a: https://neon.tech
2. Click en "Sign Up" (puedes usar GitHub)
3. Crea un nuevo proyecto

## 2. Obtener la URL de conexión

1. En el dashboard de Neon, ve a tu proyecto
2. Click en "Connection Details"
3. Copia la "Connection string" que se ve así:
   ```
   postgresql://username:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

## 3. Configurar el backend

Edita el archivo `.env`:

```env
# Comenta las líneas de DB local
# DB_NAME=sports_booking_db
# DB_USER=postgres
# DB_PASSWORD=password
# DB_HOST=localhost
# DB_PORT=5432

# Agrega la URL de Neon
DATABASE_URL=postgresql://username:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
```

## 4. Inicializar las tablas

```bash
cd sports-booking-backend
npm run db:sync
```

## 5. (Opcional) Cargar datos de prueba

```bash
npm run db:init
```

## 6. Iniciar el servidor

```bash
npm run dev
```

## Ventajas de Neon

- ✅ Gratis (tier gratuito generoso)
- ✅ No necesitas instalar nada
- ✅ Funciona igual que Railway en producción
- ✅ SSL incluido
- ✅ Backups automáticos

## Alternativa: Supabase

Supabase también ofrece PostgreSQL gratis:

1. Ve a: https://supabase.com
2. Crea un proyecto
3. Ve a Settings → Database → Connection string
4. Usa esa URL en tu `.env`
