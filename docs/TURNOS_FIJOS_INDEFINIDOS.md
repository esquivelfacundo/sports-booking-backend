# Turnos Fijos Indefinidos - Análisis de Implementación

> **Fecha:** Febrero 2026  
> **Objetivo:** Permitir crear turnos fijos sin límite de semanas

---

## Estado Actual

- **Frontend:** `CreateBookingSidebar.tsx` tiene checkbox "Turno fijo" + input numérico para semanas (default: 8)
- **Backend:** `recurring-bookings.js` genera array de fechas y crea TODAS las reservas en una transacción
- **Modelo:** `RecurringBookingGroup` tiene `totalOccurrences`, `startDate`, `endDate`
- **Ya existe:** Funcionalidad "Cancelar reservas pendientes"

---

## Opción A: Indefinido = 52 semanas (1 año)

### Descripción
Agregar toggle "Indefinido" que setea `recurringWeeks = 52`. Simple y efectivo.

### Archivos a Modificar
| Archivo | Cambio |
|---------|--------|
| `CreateBookingSidebar.tsx` | Agregar checkbox "Indefinido" |
| `CreateReservationSidebar.tsx` | Mismo cambio si aplica |

### Cambios en Frontend
```tsx
const [isIndefinite, setIsIndefinite] = useState(false);
const INDEFINITE_WEEKS = 52;

// Toggle que al activarse setea 52 semanas
<input
  type="checkbox"
  checked={isIndefinite}
  onChange={(e) => {
    setIsIndefinite(e.target.checked);
    if (e.target.checked) setRecurringWeeks(52);
  }}
/>
<label>Turno fijo indefinido (1 año)</label>
```

### Backend
**Sin cambios.** Ya soporta cualquier número de semanas.

### Impacto
- **DB:** 52 registros en `bookings` por turno fijo
- **Performance:** Más datos en grilla, pero ya hay filtros por fecha
- **Tiempo implementación:** ~2 horas

### Pros
- ✅ Implementación rápida
- ✅ Sin cambios en backend
- ✅ Sin infraestructura adicional (cron jobs)
- ✅ Reutiliza funcionalidades existentes
- ✅ Fácil de entender

### Contras
- ❌ Crea muchos registros de una vez
- ❌ Si el jugador deja temprano, hay que cancelar muchas reservas
- ❌ No es "verdaderamente" indefinido (límite 1-2 años)

### Flujo Usuario
1. Marca "Turno fijo" → 2. Marca "Indefinido" → 3. Crea (52 reservas)
4. Cuando jugador deja → "Cancelar pendientes" desde sección Turnos Fijos

---

## Opción B: Generación Automática (Cron Job)

### Descripción
Sistema donde reservas se generan automáticamente cada semana. Solo mantiene 4-8 semanas adelante.

### Archivos a Modificar
| Archivo | Cambio |
|---------|--------|
| `RecurringBookingGroup.js` | Agregar campos `isIndefinite`, `weeksAhead`, `lastGeneratedDate` |
| Nueva migración | Agregar columnas |
| `recurring-bookings.js` | Lógica para grupos indefinidos |
| Nuevo `scripts/generate-recurring.js` | Cron job |
| `CreateBookingSidebar.tsx` | UI para indefinido |

### Migración Requerida
```javascript
await queryInterface.addColumn('recurring_booking_groups', 'isIndefinite', {
  type: Sequelize.BOOLEAN,
  defaultValue: false
});
await queryInterface.addColumn('recurring_booking_groups', 'weeksAhead', {
  type: Sequelize.INTEGER,
  defaultValue: 4
});
await queryInterface.addColumn('recurring_booking_groups', 'lastGeneratedDate', {
  type: Sequelize.DATEONLY,
  allowNull: true
});
```

### Cron Job (nuevo archivo)
```javascript
// scripts/generate-recurring.js - Ejecutar diario o semanal
const groups = await RecurringBookingGroup.findAll({
  where: { isIndefinite: true, status: 'active' }
});

for (const group of groups) {
  const weeksNeeded = calcularSemanasNecesarias(group);
  for (let i = 0; i < weeksNeeded; i++) {
    await crearReserva(group, nuevaFecha);
  }
  await group.update({ lastGeneratedDate: ultimaFecha });
}
```

### Configuración Cron (Railway/Heroku)
```bash
# Ejecutar cada lunes a las 3am
0 3 * * 1 node scripts/generate-recurring.js
```

### Impacto
- **DB:** Solo 4-8 registros adelante por grupo (menos datos)
- **Infraestructura:** Requiere cron job configurado
- **Tiempo implementación:** ~8-12 horas

### Pros
- ✅ Verdaderamente indefinido
- ✅ Menos datos en DB/grilla
- ✅ Más eficiente a largo plazo
- ✅ Fácil de pausar/reanudar

### Contras
- ❌ Requiere cron job (infraestructura)
- ❌ Si cron falla, no se crean reservas
- ❌ Más complejo de debuggear
- ❌ Más tiempo de desarrollo
- ❌ Dependencia de proceso externo

---

## Comparativa Directa

| Aspecto | Opción A (52 semanas) | Opción B (Cron) |
|---------|----------------------|-----------------|
| **Tiempo dev** | 2 horas | 8-12 horas |
| **Cambios backend** | Ninguno | Migración + cron |
| **Infraestructura** | Ninguna | Cron job |
| **Registros creados** | 52 de una vez | 4-8 rolling |
| **Riesgo de falla** | Bajo | Medio (cron) |
| **Mantenimiento** | Bajo | Medio |
| **"Verdaderamente" indefinido** | No (1-2 años max) | Sí |

---

## Recomendación Final

**Opción A** para la mayoría de casos:
- Más simple, menos riesgo
- El cliente puede crear turnos de 1 año
- Funcionalidad de cancelar ya existe
- Si necesita más de 1 año, puede crear otro turno fijo

**Opción B** solo si:
- Hay muchos turnos fijos (+100)
- Performance de grilla es crítica
- Ya tienen infraestructura de cron jobs

---

## Ejecución Opción A

```bash
# 1. Modificar frontend
# Editar: src/components/admin/CreateBookingSidebar.tsx

# 2. Probar localmente
npm run dev

# 3. Commit y deploy
git add .
git commit -m "feat: agregar opción turno fijo indefinido (52 semanas)"
git push
```

## Ejecución Opción B

```bash
# 1. Crear migración
npx sequelize-cli migration:generate --name add-indefinite-recurring

# 2. Ejecutar migración
npm run migrate

# 3. Crear script cron
# Crear: scripts/generate-recurring.js

# 4. Configurar cron en Railway/Heroku
# railway.json o Procfile

# 5. Modificar frontend y backend

# 6. Deploy
git push
```
