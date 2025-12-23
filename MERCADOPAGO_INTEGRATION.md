# Integración Mercado Pago - Sports Booking Platform

## Resumen
Integración completa de Mercado Pago con:
- OAuth para conectar establecimientos
- Split Payments (dinero al establecimiento, comisión a la plataforma)
- Configuración dinámica de comisiones (global y por establecimiento)
- Cuenta de plataforma configurable via OAuth (no hardcodeada)

---

## Fases de Implementación

### Fase 1: Backend - Estructura Base
- [x] 1.1 Agregar variables de entorno de MP
- [x] 1.2 Crear modelo `PlatformConfig` para configuración global (cuenta MP admin, comisión default)
- [x] 1.3 Agregar campos MP al modelo `Establishment` (mpUserId, mpAccessToken, mpRefreshToken, customFeePercent)
- [x] 1.4 Crear servicio `mercadopago.js` (OAuth, Split Payments)
- [x] 1.5 Crear rutas `/api/mp/oauth` (authorize, callback, disconnect)
- [x] 1.6 Crear rutas `/api/mp/payments` (create-split-preference)
- [x] 1.7 Crear ruta `/api/mp/webhooks` (notificaciones de pago)
- [x] 1.8 Crear rutas `/api/mp/platform` (configurar cuenta admin, comisión global)

### Fase 2: Frontend Admin - Conectar Cuenta MP (Establecimiento)
- [x] 2.1 Agregar sección "Mercado Pago" en configuración del establecimiento
- [x] 2.2 Botón "Conectar Mercado Pago" con OAuth
- [x] 2.3 Mostrar estado de conexión y datos de cuenta
- [x] 2.4 Opción para desconectar cuenta
- [ ] 2.5 Campo para comisión personalizada (override del global) - Solo visible para superadmin

### Fase 3: Frontend SuperAdmin - Configuración de Plataforma
- [x] 3.1 Crear página/sección de configuración de plataforma
- [x] 3.2 Botón "Conectar cuenta de comisiones" (OAuth para cuenta admin)
- [x] 3.3 Campo para definir comisión global (%)
- [x] 3.4 Mostrar estado de cuenta de comisiones conectada

### Fase 4: Frontend Público - Pago con Split
- [ ] 4.1 Modificar `/reservar/pago` para usar MP real
- [ ] 4.2 Calcular y mostrar tarifa de servicio al usuario
- [ ] 4.3 Implementar split payment (establecimiento + comisión plataforma)
- [ ] 4.4 Configurar URLs de retorno (success/failure/pending)
- [ ] 4.5 Página de confirmación con datos del pago

### Fase 5: Webhooks y Estados
- [ ] 5.1 Procesar webhooks de MP (payment.approved, rejected, etc.)
- [ ] 5.2 Actualizar estado de reserva según pago
- [ ] 5.3 Registrar transacciones en base de datos
- [ ] 5.4 Notificaciones al establecimiento y usuario

### Fase 6: Testing y Deploy
- [ ] 6.1 Probar flujo completo en sandbox
- [ ] 6.2 Configurar webhooks en MP Developers
- [ ] 6.3 Probar con credenciales de producción
- [ ] 6.4 Documentar configuración necesaria

---

## Configuración Requerida

### Variables de Entorno (.env)
```env
# Mercado Pago - Credenciales de la Aplicación (Marketplace)
MP_ACCESS_TOKEN=APP_USR-xxx
MP_PUBLIC_KEY=APP_USR-xxx
MP_CLIENT_ID=xxx
MP_CLIENT_SECRET=xxx

# Webhook
MP_WEBHOOK_SECRET=xxx

# URLs
APP_URL=http://localhost:8001
FRONTEND_URL=http://localhost:4555
```

### Configuración en MP Developers
1. Crear aplicación en https://www.mercadopago.com.ar/developers/panel
2. Configurar Redirect URI: `{APP_URL}/api/mp/oauth/callback`
3. Configurar Webhook URL: `{APP_URL}/api/mp/webhooks`
4. Habilitar permisos de OAuth y Split Payments

---

## Flujo de Pagos

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   CLIENTE    │────▶│  PLATAFORMA  │────▶│ MERCADO PAGO │
│  paga $10000 │     │  (tu SaaS)   │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
                            │                     │
                            │                     ▼
                            │              ┌──────────────┐
                            │              │ESTABLECIMIENTO│
                            │              │ recibe $9000 │
                            │              └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │  TU CUENTA   │
                     │ recibe $1000 │
                     │  (comisión)  │
                     └──────────────┘
```

---

## Notas de Implementación

### Prioridad de Comisión
1. Si el establecimiento tiene `customFeePercent` → usar ese valor
2. Si no → usar `PlatformConfig.defaultFeePercent`
3. Si no existe → usar 10% (fallback)

### Cuenta de Comisiones (Admin)
- Se conecta via OAuth igual que los establecimientos
- Se guarda en `PlatformConfig.mpUserId`, `mpAccessToken`, etc.
- Los split payments usan esta cuenta como collector

---

## Progreso

**Última actualización:** 2025-12-17
**Estado actual:** Fase 3 completada - SuperAdmin con configuración de MP y comisiones
