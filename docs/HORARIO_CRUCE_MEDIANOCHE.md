# Mejora: Soporte de Horarios que Cruzan Medianoche

## Contexto del Problema

Cuando un establecimiento configura horario de apertura 08:00 y cierre 01:30 AM, significa que abre a las 08:00 del día X y cierra a las 01:30 del día X+1. Actualmente, el sistema interpreta `closeTime < openTime` como un rango inválido, generando 0 slots de disponibilidad.

**Ejemplo real**: Apertura 08:00, Cierre 01:30 AM
- `openMinutes = 480` (08:00)
- `closeMinutes = 90` (01:30)
- Loop: `for (time = 480; time + 60 <= 90; ...)` → **nunca ejecuta** → 0 slots

---

## Inventario Completo de Archivos Afectados

### BACKEND (sports-booking-backend)

#### 1. `src/controllers/courtController.js` — Línea 583
- **Función**: `generateTimeSlots(openTime, closeTime, duration, bookings, blockedSlots, court)`
- **Uso**: Endpoint `GET /api/courts/:id/availability` — genera slots disponibles para una cancha en una fecha
- **Problema**: `for (time = openMinutes; time + durationMinutes <= closeMinutes; time += 30)` no itera si `closeMinutes < openMinutes`
- **Consumido por**: Frontend admin (grilla de reservas), Frontend público (página de reserva del jugador)
- **Prioridad**: CRÍTICA — es la fuente principal de disponibilidad

#### 2. `src/routes/api-v1.js` — Línea 485
- **Función**: `generateAvailableSlots(openTime, closeTime, bookings, duration, specificHour)`
- **Uso**: Endpoint `GET /api/v1/disponibilidad` — API pública v1 de disponibilidad
- **Problema**: Mismo loop roto que el punto 1
- **Consumido por**: Integraciones externas, posible uso interno
- **Prioridad**: ALTA

### FRONTEND (sports-booking-platform)

#### 3. `src/app/establecimientos/admin/reservas/page.tsx` — Línea 186
- **Función**: `getOpeningHoursForDate(date)`
- **Uso**: Calcula `startHour` y `endHour` para pasarlos al componente `BookingCalendarGrid`
- **Problema**: `endHour = parseInt("01") = 1`, pasa `startHour=8, endHour=1` al grid
- **Prioridad**: CRÍTICA — controla la grilla del admin

#### 4. `src/components/admin/BookingCalendarGrid.tsx` — Línea 71
- **Función**: `generateTimeSlots(startHour, endHour)`
- **Uso**: Genera las filas de la grilla visual de reservas
- **Problema**: `for (hour = 8; hour < 1; ...)` → 0 filas
- **Sub-problemas**:
  - Línea 195-201: Indicador de hora actual — compara contra rango `startHour..endHour`
  - Línea 460-461: Posicionamiento de booking cards — calcula offset desde `startHour * 60`
- **Prioridad**: CRÍTICA

#### 5. `src/app/reservar/[id]/page.tsx` — Línea 512
- **Función**: `fetchAvailability()` dentro de la página de reserva pública
- **Uso**: Genera un Map de slots de 08:00 a 23:00 hardcodeado, luego filtra contra respuesta del backend
- **Problema**: Si el backend devuelve slots de 23:00-01:30, el Map no los contiene → se pierden
- **Sub-problema línea 562**: `generateFallbackSlots()` — mismo bug de `endHour < startHour`
- **Prioridad**: CRÍTICA — afecta reservas de jugadores

#### 6. `src/components/admin/CreateReservationSidebar.tsx` — Línea 296
- **Función**: Generación de slots en el sidebar "Nueva Reserva"
- **Uso**: Genera slots hardcodeados de 08:00 a 23:00
- **Problema**: No usa horarios del establecimiento, pero tampoco soporta post-medianoche
- **Prioridad**: MEDIA — el sidebar admin usa la API de disponibilidad como fuente principal

### ARCHIVOS QUE NO REQUIEREN CAMBIOS (verificados)

| Archivo | Razón |
|---------|-------|
| `src/models/Establishment.js` | Solo define el modelo, no genera slots |
| `src/controllers/establishmentController.js` | Solo guarda/lee openingHours |
| `src/controllers/bookingController.js` | Solo incluye openingHours en query, no genera slots |
| `src/controllers/priceScheduleController.js` | Usa timeToMinutes para precios, no horarios de apertura |
| `src/app/establecimientos/admin/canchas/page.tsx` | Solo muestra datos de canchas |
| `src/components/dashboard/CourtModal.tsx` | Solo formulario de edición |
| `src/contexts/EstablishmentContext.tsx` | Solo define tipos TypeScript |
| `src/components/establishment/steps/ScheduleStep.tsx` | Solo UI de configuración de horarios |
| `src/hooks/useEstablishments.ts` | Solo fetch de datos |

---

## Concepto de la Solución

**Regla**: Cuando `closeTime <= openTime`, el cierre es al día siguiente. Internamente sumamos 24 horas (1440 minutos) al closeTime para los cálculos.

```
Ejemplo: open=08:00, close=01:30
→ openMinutes = 480
→ closeMinutes = 90 + 1440 = 1530
→ Genera slots de 480 a 1530 (08:00 a 25:30)
→ Los slots 24:00+ se formatean como 00:00, 00:30, 01:00 en la UI
```

**Sobre bookings en la DB**: Los bookings post-medianoche se guardan con la fecha calendario real (día siguiente). La grilla del admin del día X debe también mostrar bookings de fecha X+1 que caigan en el rango 00:00-closeTime. Esto NO se implementa en esta mejora — es una mejora futura separada. Por ahora, los slots post-medianoche se muestran vacíos en la grilla pero son reservables.

---

## Plan de Ejecución Paso a Paso

### PASO 1: Backend — `courtController.js` (generateTimeSlots)

**Archivo**: `src/controllers/courtController.js`
**Líneas**: 583-633

**Cambio**: En `generateTimeSlots()`, detectar cruce de medianoche y sumar 1440 a closeMinutes. Ajustar `minutesToTime()` para manejar horas >= 24.

```javascript
// ANTES (línea 588-589):
const openMinutes = timeToMinutes(openTime);
const closeMinutes = timeToMinutes(closeTime);

// DESPUÉS:
const openMinutes = timeToMinutes(openTime);
let closeMinutes = timeToMinutes(closeTime);
// Si el cierre es antes que la apertura, cruza medianoche (ej: abre 08:00, cierra 01:30)
if (closeMinutes <= openMinutes) {
  closeMinutes += 1440; // Sumar 24 horas
}
```

```javascript
// ANTES (línea 593-594):
const startTime = minutesToTime(time);
const endTime = minutesToTime(time + durationMinutes);

// DESPUÉS:
const startTime = minutesToTime(time % 1440);
const endTime = minutesToTime((time + durationMinutes) % 1440);
```

**Verificación**: 
- Con open=08:00, close=22:00 → closeMinutes=1320 > openMinutes=480 → sin cambio (comportamiento actual)
- Con open=08:00, close=01:30 → closeMinutes=90 → 90+1440=1530 → genera slots de 480 a 1530
- Slot a las 24:00 → `minutesToTime(1440 % 1440)` = "00:00" ✓
- Slot a las 25:00 → `minutesToTime(1500 % 1440)` = "01:00" ✓

**Riesgo**: BAJO — la función solo se usa en el endpoint de availability, y el cambio es aditivo (no modifica el caso normal).

**Efecto colateral a verificar**: Los bookings existentes que tienen startTime "00:30" se guardan con date del día siguiente. La comparación de conflictos en línea 597-601 usa `timeToMinutes(booking.startTime)` que devuelve 30 para "00:30". Pero nuestro loop genera `time=1470` para el slot de 00:30. La comparación `time < bookingEnd && time + duration > bookingStart` sería `1470 < bookingEnd && 1530 > 30` — esto NO matchearía correctamente. **Necesitamos normalizar los tiempos de booking también** cuando estamos en rango post-medianoche.

```javascript
// En la comparación de conflictos, si time >= 1440, los bookings de ese rango
// tienen startTime en formato 00:XX, así que debemos sumarles 1440 también
const isBooked = bookings.some(booking => {
  let bookingStart = timeToMinutes(booking.startTime);
  let bookingEnd = timeToMinutes(booking.endTime);
  // Si estamos generando slots post-medianoche, ajustar bookings que caen en ese rango
  if (closeMinutes > 1440) {
    if (bookingStart < openMinutes) bookingStart += 1440;
    if (bookingEnd <= openMinutes) bookingEnd += 1440;
  }
  return (time < bookingEnd && time + durationMinutes > bookingStart);
});
```

**Nota**: Los bookings post-medianoche se consultan con `date = fecha seleccionada`, pero en realidad están guardados con `date = fecha + 1`. Esto significa que la query actual NO los trae. Para que la verificación de conflictos funcione correctamente en el rango post-medianoche, el endpoint debería también consultar bookings del día siguiente con hora < closeTime. **Esto se documenta como limitación conocida de esta primera iteración**.

---

### PASO 2: Backend — `api-v1.js` (generateAvailableSlots)

**Archivo**: `src/routes/api-v1.js`
**Líneas**: 485-546

**Cambio**: Misma lógica que Paso 1.

```javascript
// ANTES (línea 490-491):
const openMinutes = openH * 60 + openM;
const closeMinutes = closeH * 60 + closeM;

// DESPUÉS:
const openMinutes = openH * 60 + openM;
let closeMinutes = closeH * 60 + closeM;
if (closeMinutes <= openMinutes) {
  closeMinutes += 1440;
}
```

```javascript
// ANTES (línea 494-496):
const hours = Math.floor(time / 60);
const mins = time % 60;
const timeStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;

// DESPUÉS:
const normalizedTime = time % 1440;
const hours = Math.floor(normalizedTime / 60);
const mins = normalizedTime % 60;
const timeStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
```

Y lo mismo para `endTime` (línea 502-504) y las comparaciones de duración (línea 521).

**Verificación**: Misma que Paso 1.
**Riesgo**: BAJO — misma lógica aditiva.

---

### PASO 3: Frontend — `reservas/page.tsx` (getOpeningHoursForDate)

**Archivo**: `src/app/establecimientos/admin/reservas/page.tsx`
**Líneas**: 186-207

**Cambio**: Si `endHour <= startHour`, sumar 24 a `endHour`.

```typescript
// ANTES (línea 203-204):
const startHour = parseInt(daySchedule.open?.split(':')[0] || '8');
const endHour = parseInt(daySchedule.close?.split(':')[0] || '23');

// DESPUÉS:
const startHour = parseInt(daySchedule.open?.split(':')[0] || '8');
let endHour = parseInt(daySchedule.close?.split(':')[0] || '23');
// Si el cierre es antes que la apertura, cruza medianoche
if (endHour <= startHour) {
  endHour += 24;
}
```

**Verificación**:
- open=08:00, close=22:00 → startHour=8, endHour=22 → sin cambio ✓
- open=08:00, close=01:30 → startHour=8, endHour=1 → endHour=25 ✓
- open=00:00, close=00:00 → startHour=0, endHour=0 → endHour=24 (24h) ✓

**Riesgo**: BAJO — solo afecta los props que se pasan al grid.

---

### PASO 4: Frontend — `BookingCalendarGrid.tsx` (generateTimeSlots + posicionamiento)

**Archivo**: `src/components/admin/BookingCalendarGrid.tsx`

#### 4a. `generateTimeSlots()` — Línea 71-78

```typescript
// ANTES:
const generateTimeSlots = (startHour: number, endHour: number): string[] => {
  const slots: string[] = [];
  for (let hour = startHour; hour < endHour; hour++) {
    slots.push(`${hour.toString().padStart(2, '0')}:00`);
    slots.push(`${hour.toString().padStart(2, '0')}:30`);
  }
  return slots;
};

// DESPUÉS:
const generateTimeSlots = (startHour: number, endHour: number): string[] => {
  const slots: string[] = [];
  for (let hour = startHour; hour < endHour; hour++) {
    const displayHour = hour % 24;
    slots.push(`${displayHour.toString().padStart(2, '0')}:00`);
    slots.push(`${displayHour.toString().padStart(2, '0')}:30`);
  }
  return slots;
};
```

**Verificación**:
- startHour=8, endHour=22 → genera 08:00..21:30 (sin cambio) ✓
- startHour=8, endHour=25 → genera 08:00..21:30, 22:00..23:30, 00:00..00:30 ✓

#### 4b. Indicador de hora actual — Línea 195-204

```typescript
// ANTES:
if (currentTotalMinutes < startTotalMinutes || currentTotalMinutes >= endHour * 60) {

// DESPUÉS:
// Para endHour > 24, el rango real en minutos es startHour*60 hasta endHour*60
// Pero currentTotalMinutes es siempre 0-1439, así que si estamos post-medianoche
// (currentTotalMinutes < startTotalMinutes), sumamos 1440 para comparar
let adjustedCurrentMinutes = currentTotalMinutes;
if (endHour > 24 && currentTotalMinutes < startTotalMinutes) {
  adjustedCurrentMinutes += 1440;
}
if (adjustedCurrentMinutes < startTotalMinutes || adjustedCurrentMinutes >= endHour * 60) {
```

Y usar `adjustedCurrentMinutes` en el cálculo de posición (línea 207):
```typescript
const minutesFromStart = adjustedCurrentMinutes - startTotalMinutes;
```

#### 4c. Posicionamiento de booking cards — Línea 460-462

```typescript
// ANTES:
const startMinutes = parseTimeToMinutes(booking.startTime);
const slotStartMinutes = startHour * 60;
const topSlots = (startMinutes - slotStartMinutes) / 30;

// DESPUÉS:
let startMinutes = parseTimeToMinutes(booking.startTime);
const slotStartMinutes = startHour * 60;
// Si el booking es post-medianoche y el grid cruza medianoche, ajustar
if (endHour > 24 && startMinutes < slotStartMinutes) {
  startMinutes += 1440;
}
const topSlots = (startMinutes - slotStartMinutes) / 30;
```

#### 4d. `getBookingForSlot()` — Línea 98-124

```typescript
// ANTES:
const slotMinutes = parseTime(time);
const startMinutes = parseTime(booking.startTime);
const endMinutes = startMinutes + booking.duration;
return slotMinutes >= startMinutes && slotMinutes < endMinutes;

// DESPUÉS:
let slotMinutes = parseTime(time);
let startMinutes = parseTime(booking.startTime);
// Si el slot es post-medianoche (ej: 00:30) pero el grid empieza antes (ej: 08:00)
// y el booking también es post-medianoche, necesitamos normalizar
// Nota: los slots post-medianoche se formatean como 00:XX, 01:XX
// pero representan horas 24:XX, 25:XX del día anterior
// Por ahora, esta función compara por string de fecha, así que solo matchea
// bookings del mismo date. Los bookings post-medianoche tienen date = día+1.
// LIMITACIÓN CONOCIDA: bookings post-medianoche no se muestran en la grilla del día de apertura.
const endMinutes = startMinutes + booking.duration;
return slotMinutes >= startMinutes && slotMinutes < endMinutes;
```

**Riesgo**: MEDIO — el posicionamiento de cards es visual y cualquier error es inmediatamente visible pero no destructivo.

---

### PASO 5: Frontend — `reservar/[id]/page.tsx` (fetchAvailability + fallback)

**Archivo**: `src/app/reservar/[id]/page.tsx`

#### 5a. `fetchAvailability()` — Línea 512-519

Cambiar el Map hardcodeado para usar horarios del establecimiento:

```typescript
// ANTES:
// Generate all possible time slots from 8:00 to 23:00 every 30 minutes
const slots: Map<string, string[]> = new Map();
for (let hour = 8; hour <= 23; hour++) {
  slots.set(`${hour.toString().padStart(2, '0')}:00`, []);
  if (hour < 23) {
    slots.set(`${hour.toString().padStart(2, '0')}:30`, []);
  }
}

// DESPUÉS:
// Get opening hours for the selected date
const dayOfWeek = new Date(selectedDate + 'T00:00:00').getDay();
const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const dayName = dayNames[dayOfWeek];
const daySchedule = establishment?.openingHours?.[dayName];

let openHour = 8;
let closeHour = 23;
if (daySchedule && !daySchedule.closed) {
  openHour = parseInt(daySchedule.open?.split(':')[0] || '8');
  closeHour = parseInt(daySchedule.close?.split(':')[0] || '23');
  if (closeHour <= openHour) closeHour += 24;
}

const slots: Map<string, string[]> = new Map();
for (let hour = openHour; hour < closeHour; hour++) {
  const displayHour = hour % 24;
  slots.set(`${displayHour.toString().padStart(2, '0')}:00`, []);
  slots.set(`${displayHour.toString().padStart(2, '0')}:30`, []);
}
```

#### 5b. `generateFallbackSlots()` — Línea 562-597

```typescript
// ANTES (línea 574-575):
startHour = parseInt(daySchedule.open?.split(':')[0] || '8');
endHour = parseInt(daySchedule.close?.split(':')[0] || '23');

// DESPUÉS:
startHour = parseInt(daySchedule.open?.split(':')[0] || '8');
endHour = parseInt(daySchedule.close?.split(':')[0] || '23');
if (endHour <= startHour) endHour += 24;
```

Y en el loop (línea 581-586):
```typescript
// ANTES:
for (let hour = startHour; hour <= endHour - durationHours; hour++) {
  for (let minute = 0; minute < 60; minute += 30) {
    const slotEndHour = hour + (minute + selectedDuration) / 60;
    if (slotEndHour > endHour) continue;
    const time = `${hour.toString().padStart(2, '0')}:${minute...}`;

// DESPUÉS:
for (let hour = startHour; hour <= endHour - durationHours; hour++) {
  for (let minute = 0; minute < 60; minute += 30) {
    const slotEndHour = hour + (minute + selectedDuration) / 60;
    if (slotEndHour > endHour) continue;
    const displayHour = hour % 24;
    const time = `${displayHour.toString().padStart(2, '0')}:${minute...}`;
```

**Riesgo**: MEDIO — afecta la experiencia de reserva del jugador.

---

### PASO 6: Frontend — `CreateReservationSidebar.tsx` (slots hardcodeados)

**Archivo**: `src/components/admin/CreateReservationSidebar.tsx`
**Líneas**: 296-302

**Cambio**: Usar horarios del establecimiento. El sidebar recibe `establishmentId` como prop, y tiene acceso a los datos del establecimiento.

```typescript
// ANTES:
// Generate time slots from 8:00 to 23:00 every 30 minutes
for (let hour = 8; hour <= 23; hour++) {
  slots.set(`${hour.toString().padStart(2, '0')}:00`, []);
  if (hour < 23) {
    slots.set(`${hour.toString().padStart(2, '0')}:30`, []);
  }
}

// DESPUÉS: Usar horarios del establecimiento (requiere acceso al schedule)
// Si no hay schedule disponible, fallback a 8-23
let slotStartHour = 8;
let slotEndHour = 23;
// TODO: obtener horarios del establecimiento si están disponibles
for (let hour = slotStartHour; hour < slotEndHour; hour++) {
  const displayHour = hour % 24;
  slots.set(`${displayHour.toString().padStart(2, '0')}:00`, []);
  slots.set(`${displayHour.toString().padStart(2, '0')}:30`, []);
}
```

**Nota**: Este sidebar usa la API de disponibilidad como fuente principal (línea 331). Los slots hardcodeados son solo el "contenedor" — si el backend devuelve un slot que no está en el Map, simplemente no se muestra. Dado que el Paso 1 ya corrige el backend, los slots post-medianoche llegarán del backend. Solo necesitamos que el Map los contenga.

**Riesgo**: BAJO — es un contenedor para la respuesta del backend.

---

## Limitaciones Conocidas (Primera Iteración)

1. **Bookings post-medianoche en la grilla del admin**: Los bookings creados para horarios 00:00-01:30 se guardan con `date = día+1`. La grilla del día X no los mostrará porque consulta bookings con `date = X`. Se necesitaría una query adicional para traer bookings de `date = X+1` con `startTime < closeTime`. **Esto se implementará en una segunda iteración**.

2. **Conflictos de disponibilidad post-medianoche**: El endpoint de availability consulta bookings por `date`. Para el rango post-medianoche, debería consultar bookings del día siguiente. **Misma segunda iteración**.

3. **Minutos del closeTime**: Actualmente solo parseamos la hora (`parseInt(close.split(':')[0])`), ignorando los minutos. Si el cierre es a las 01:30, `endHour=25` pero los slots se generan hasta 24:30 (no 25:30). **Para la primera iteración esto es aceptable** — el backend sí usa los minutos completos.

---

## Orden de Deployment

1. **Backend primero** (Pasos 1 y 2) — los cambios son retrocompatibles, no rompen el frontend actual
2. **Frontend después** (Pasos 3, 4, 5, 6) — depende de que el backend ya devuelva slots post-medianoche

---

## Testing Manual Post-Deploy

### Test 1: Caso normal (sin cruce de medianoche)
- Configurar horario 08:00 - 22:00
- Verificar que la grilla muestra slots de 08:00 a 21:30 ✓
- Verificar que se pueden crear reservas normalmente ✓
- Verificar que la página de reserva pública muestra slots correctos ✓

### Test 2: Cruce de medianoche
- Configurar horario 08:00 - 01:30
- Verificar que la grilla muestra slots de 08:00 a 01:00
- Verificar que el backend devuelve slots post-medianoche en `/api/courts/:id/availability`
- Verificar que la página de reserva pública muestra los slots extendidos

### Test 3: Caso borde — cierre a medianoche exacta
- Configurar horario 08:00 - 00:00
- Verificar que genera slots de 08:00 a 23:30

### Test 4: Caso borde — apertura temprana
- Configurar horario 06:00 - 23:00
- Verificar que no se activa la lógica de cruce (23 > 6)

### Test 5: Regresión — reservas existentes
- Verificar que las reservas existentes siguen apareciendo correctamente en la grilla
- Verificar que los pagos y la caja no se ven afectados
- Verificar que los turnos fijos siguen funcionando

---

## Rollback Plan

Si algo falla en producción:

1. **Backend**: Revertir el commit del backend y re-deployar en Railway
2. **Frontend**: Revertir el commit del frontend y re-deployar en Vercel
3. Los cambios son independientes entre sí — se puede revertir uno sin el otro
4. No hay cambios de base de datos — no se necesita migración ni rollback de DB
