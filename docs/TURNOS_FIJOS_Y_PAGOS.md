# Sistema de Turnos Fijos y Pagos - Análisis e Implementación

## Resumen de Requerimientos

### 1. Turnos Fijos con Pago Adelantado Escalonado
**Escenario:** Juan reserva turno fijo por 4 semanas.

| Semana | Acción | Pago |
|--------|--------|------|
| Semana 1 | Al reservar | Paga cancha semana 1 |
| Semana 1 | Al llegar al partido | Paga cancha semana 2 |
| Semana 2 | Al llegar al partido | Paga cancha semana 3 |
| Semana 3 | Al llegar al partido | Paga cancha semana 4 |
| Semana 4 | Al llegar al partido | Fin del ciclo |

**Lógica:** Siempre va "una cancha adelantado".

### 2. Política de Cancelación con Deuda
- Si cancela con **menos de 24h**: se cobra 100% de la reserva
- Si no pagó la seña completa, queda como **deuda pendiente**
- La deuda es **por establecimiento** (no global)
- Próxima vez que reserve en ese establecimiento, debe saldar la deuda

### 3. Cálculo de Pendiente (CRÍTICO)
**El pendiente NO debe incluir la tarifa de servicio**

Ejemplo:
- Cancha: $10,000
- Seña: 50% = $5,000
- Tarifa servicio: 10% = $1,000
- **Total checkout:** $6,000 (seña + tarifa)
- **Pendiente en cancha:** $5,000 (solo el 50% restante de la cancha)

### 4. Opción de Pago Completo
El establecimiento puede habilitar que el jugador pague el 100% por el sistema.

**Opciones en checkout (si está habilitado):**
1. **Pagar seña:** $6,000 (50% cancha + 10% tarifa sobre seña)
2. **Pago completo:** $11,000 (100% cancha + 10% tarifa sobre total)

### 5. Split Payment
Verificar que funcione correctamente:
- Monto cancha → cuenta del establecimiento
- Tarifa servicio → cuenta de MisCanchas (superadmin)

---

## Checklist de Implementación

### Análisis Previo
- [ ] Revisar modelo actual de Booking y campos relacionados con pagos
- [ ] Revisar modelo de Establishment para configuraciones de pago
- [ ] Revisar flujo actual de Mercado Pago y split payment
- [ ] Verificar cálculo actual de pendiente

### Fase 1: Corrección del Cálculo de Pendiente
- [ ] Asegurar que `pendingAmount` = precio cancha - seña (sin tarifa de servicio)
- [ ] Actualizar webhook de MP para calcular correctamente
- [ ] Actualizar emails para mostrar monto correcto

### Fase 2: Opción de Pago Completo
- [ ] Agregar campo `allowFullPayment` en Establishment
- [ ] Modificar endpoint de checkout para soportar tipo de pago
- [ ] Actualizar frontend de checkout con selector de opción
- [ ] Ajustar split payment para pago completo

### Fase 3: Sistema de Deudas por Establecimiento
- [ ] Crear modelo `ClientDebt` (clientId, establishmentId, amount, reason, createdAt)
- [ ] Implementar lógica de cancelación tardía que genera deuda
- [ ] Mostrar deuda pendiente al reservar
- [ ] Agregar deuda al monto de checkout
- [ ] Panel admin para ver/gestionar deudas

### Fase 4: Turnos Fijos con Pago Escalonado
- [ ] Modificar modelo de reservas recurrentes
- [ ] Implementar lógica de "pago adelantado"
- [ ] Trigger al completar reserva para marcar siguiente como "pendiente de pago"
- [ ] Notificaciones de pago pendiente

### Fase 5: Verificación Split Payment
- [ ] Testear split payment en sandbox
- [ ] Verificar que montos lleguen correctamente a cada cuenta
- [ ] Documentar configuración de cuentas

---

## Modelo de Datos Propuesto

### Nuevo: ClientDebt
```javascript
{
  id: UUID,
  clientId: UUID,           // Cliente que debe
  establishmentId: UUID,    // Establecimiento al que debe
  amount: DECIMAL,          // Monto de la deuda
  reason: STRING,           // 'late_cancellation', 'no_show', etc.
  bookingId: UUID,          // Reserva que originó la deuda (opcional)
  status: ENUM,             // 'pending', 'paid', 'forgiven'
  paidAt: DATE,
  createdAt: DATE
}
```

### Modificar: Establishment
```javascript
{
  // ... campos existentes ...
  allowFullPayment: BOOLEAN,        // Permitir pago completo online
  lateCancellationHours: INTEGER,   // Horas antes para cancelación sin cargo (default 24)
  lateCancellationFee: DECIMAL,     // Porcentaje de cargo por cancelación tardía (default 100)
}
```

### Modificar: Booking
```javascript
{
  // ... campos existentes ...
  paymentType: ENUM,        // 'deposit', 'full' (agregar 'full')
  courtAmount: DECIMAL,     // Monto que va a la cancha (sin tarifa)
  serviceFeeAmount: DECIMAL,// Monto de tarifa de servicio
  pendingAmount: DECIMAL,   // Lo que falta pagar en cancha (courtAmount - depositAmount)
}
```

---

## Preguntas para Clarificar

1. **Turnos fijos:** ¿El pago de la siguiente cancha se hace en persona o también por el sistema?
2. **Deuda:** ¿Se puede reservar con deuda pendiente o se bloquea hasta que pague?
3. **Split payment:** ¿Ya está configurada la cuenta de MisCanchas en MP?

---

## Estado Actual

**Fecha:** 2025-12-18

| Item | Estado |
|------|--------|
| Análisis de requerimientos | ✅ Completado |
| Revisión de código actual | ✅ Completado |
| Implementación | ⏳ Pendiente |

---

## Análisis del Código Actual

### Flujo de Pago Actual
1. Frontend (`/reservar/pago/page.tsx`) llama a `/api/mp/payments/calculate-fee` para obtener:
   - `depositInfo.baseAmount` = seña sin tarifa (ej: $5,000)
   - `depositInfo.fee` = tarifa de servicio (ej: $500)
   - `depositInfo.totalAmount` = seña + tarifa (ej: $5,500)
   - `depositInfo.percent` = porcentaje de seña (ej: 50%)

2. Se envía metadata a MP con:
   - `fullPrice`: precio total cancha ($10,000)
   - `depositBaseAmount`: seña sin tarifa ($5,000)
   - `depositFee`: tarifa ($500)
   - `depositTotal`: total pagado ($5,500)
   - `remainingAmount`: `price - depositInfo.baseAmount` = $5,000 ✅ **CORRECTO**

3. En webhook (`webhooks.js`), al crear booking:
   - `totalAmount`: `metadata.fullPrice` ($10,000)
   - `depositAmount`: `metadata.depositTotal` ($5,500) ⚠️ **PROBLEMA: incluye tarifa**

### Problema Identificado
El `depositAmount` guardado en la reserva incluye la tarifa de servicio, pero debería ser solo la seña base.

**Ejemplo actual:**
- Cancha: $10,000
- Seña 50%: $5,000
- Tarifa 10%: $500
- `depositAmount` guardado: $5,500 ❌ (incluye tarifa)
- Pendiente calculado: $10,000 - $5,500 = $4,500 ❌

**Debería ser:**
- `depositAmount` guardado: $5,000 ✅ (solo seña)
- Pendiente: $10,000 - $5,000 = $5,000 ✅

### Split Payment
El split payment está configurado correctamente:
- `marketplace_fee`: va a la cuenta de MisCanchas (plataforma)
- Resto: va a la cuenta del establecimiento

**Verificar:** Que la cuenta de MisCanchas esté configurada en MP.

---

## Plan de Implementación Detallado

### Fase 1: Corrección del Cálculo de Pendiente ✅
- [x] Modificar `webhooks.js` para guardar `depositBaseAmount` en lugar de `depositTotal`
- [x] Email ya calcula `remainingAmount = totalAmount - depositAmount` correctamente
- [ ] (Opcional) Agregar campo `serviceFeeAmount` en Booking para tracking futuro

### Fase 2: Opción de Pago Completo ✅
- [x] Agregar campo `allowFullPayment` en Establishment
- [x] Crear migración para nuevo campo (ejecutada)
- [x] Modificar `/api/mp/payments/calculate-fee` para retornar opciones
- [x] Actualizar frontend de checkout con selector de tipo de pago
- [x] Ajustar metadata y webhook para pago completo
- [x] Actualizar `paymentStatus` a 'completed' cuando es pago completo

### Fase 3: Sistema de Deudas ✅
- [x] Crear modelo `ClientDebt`
- [x] Crear migración y tabla en BD
- [x] Endpoint `/api/debts/check` para consultar deuda de cliente
- [x] Endpoint `/api/debts/establishment/:id` para admin
- [x] Endpoint `/api/debts/forgive/:id` para perdonar deudas
- [x] Integrar deuda en `/api/mp/payments/calculate-fee`
- [x] Actualizar frontend checkout para mostrar y cobrar deudas
- [x] Marcar deudas como pagadas en webhook de MP
- [ ] (Pendiente) Lógica de cancelación tardía que genera deuda automáticamente

### Fase 4: Turnos Fijos Escalonados ⏳
- [ ] Analizar modelo actual de reservas recurrentes
- [ ] Diseñar lógica de pago escalonado
- [ ] Implementar triggers de pago

### Fase 5: Verificación Split Payment ⏳
- [ ] Verificar configuración de cuenta plataforma
- [ ] Test en sandbox
- [ ] Documentar
