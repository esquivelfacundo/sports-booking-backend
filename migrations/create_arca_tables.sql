-- =====================================================
-- MIGRACIÓN: Tablas para integración ARCA/AFIP
-- Facturación Electrónica Multi-Tenant
-- Fecha: 2026-01-27
-- =====================================================

-- Habilitar extensión UUID si no existe
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLA 1: establishment_afip_configs
-- Configuración AFIP por establecimiento
-- =====================================================
CREATE TABLE IF NOT EXISTS establishment_afip_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    establishment_id UUID NOT NULL UNIQUE REFERENCES establishments(id) ON DELETE CASCADE,
    
    -- Datos fiscales
    cuit VARCHAR(11) NOT NULL UNIQUE,
    razon_social VARCHAR(255) NOT NULL,
    domicilio_fiscal VARCHAR(500) NOT NULL,
    condicion_fiscal VARCHAR(50) NOT NULL CHECK (condicion_fiscal IN ('monotributista', 'responsable_inscripto')),
    inicio_actividades DATE NOT NULL,
    
    -- Certificados encriptados (AES-256-GCM)
    encrypted_cert TEXT NOT NULL,
    encrypted_key TEXT NOT NULL,
    cert_expiration DATE,
    
    -- Estado
    is_active BOOLEAN DEFAULT false,
    is_verified BOOLEAN DEFAULT false,
    last_tested_at TIMESTAMP WITH TIME ZONE,
    last_test_result JSONB,
    
    -- Auditoría
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by_id UUID REFERENCES users(id),
    updated_by_id UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_afip_configs_establishment ON establishment_afip_configs(establishment_id);
CREATE INDEX IF NOT EXISTS idx_afip_configs_cuit ON establishment_afip_configs(cuit);
CREATE INDEX IF NOT EXISTS idx_afip_configs_is_active ON establishment_afip_configs(is_active);

-- =====================================================
-- TABLA 2: establishment_afip_puntos_venta
-- Puntos de venta AFIP por establecimiento
-- =====================================================
CREATE TABLE IF NOT EXISTS establishment_afip_puntos_venta (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
    afip_config_id UUID NOT NULL REFERENCES establishment_afip_configs(id) ON DELETE CASCADE,
    
    -- Datos del punto de venta
    numero INTEGER NOT NULL CHECK (numero > 0 AND numero <= 99999),
    descripcion VARCHAR(100),
    
    -- Estado
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(afip_config_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_puntos_venta_establishment ON establishment_afip_puntos_venta(establishment_id);
CREATE INDEX IF NOT EXISTS idx_puntos_venta_config ON establishment_afip_puntos_venta(afip_config_id);
CREATE INDEX IF NOT EXISTS idx_puntos_venta_is_active ON establishment_afip_puntos_venta(is_active);

-- =====================================================
-- TABLA 3: invoices
-- Comprobantes emitidos (facturas y notas de crédito)
-- =====================================================
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    establishment_id UUID NOT NULL REFERENCES establishments(id),
    afip_config_id UUID NOT NULL REFERENCES establishment_afip_configs(id),
    punto_venta_id UUID NOT NULL REFERENCES establishment_afip_puntos_venta(id),
    
    -- Datos AFIP (inmutables después de emisión)
    cae VARCHAR(14) NOT NULL,
    cae_vencimiento DATE NOT NULL,
    tipo_comprobante INTEGER NOT NULL,
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
    cliente_doc_tipo INTEGER NOT NULL,
    cliente_doc_nro VARCHAR(20) NOT NULL,
    cliente_condicion_iva INTEGER,
    
    -- Items (JSONB)
    items JSONB NOT NULL DEFAULT '[]',
    
    -- Relaciones con entidades facturadas
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    
    -- Para Notas de Crédito
    comprobante_asociado_id UUID REFERENCES invoices(id),
    motivo_nc VARCHAR(500),
    
    -- Estado
    status VARCHAR(20) DEFAULT 'emitido' CHECK (status IN ('emitido', 'anulado')),
    anulado_por_id UUID REFERENCES invoices(id),
    
    -- PDF
    pdf_url VARCHAR(500),
    pdf_generated_at TIMESTAMP WITH TIME ZONE,
    
    -- Respuesta AFIP completa
    afip_response JSONB NOT NULL,
    
    -- Auditoría (sin updated_at - inmutable)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by_id UUID REFERENCES users(id),
    
    -- Unicidad de comprobante
    UNIQUE(afip_config_id, tipo_comprobante, punto_venta, numero_comprobante)
);

CREATE INDEX IF NOT EXISTS idx_invoices_establishment ON invoices(establishment_id);
CREATE INDEX IF NOT EXISTS idx_invoices_cae ON invoices(cae);
CREATE INDEX IF NOT EXISTS idx_invoices_order ON invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_booking ON invoices(booking_id);
CREATE INDEX IF NOT EXISTS idx_invoices_fecha ON invoices(fecha_emision);
CREATE INDEX IF NOT EXISTS idx_invoices_tipo ON invoices(tipo_comprobante);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_comprobante_asociado ON invoices(comprobante_asociado_id);

-- =====================================================
-- MODIFICACIONES A TABLAS EXISTENTES
-- Agregar invoice_id a orders y bookings
-- =====================================================

-- Agregar invoice_id a orders (si no existe)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'invoice_id'
    ) THEN
        ALTER TABLE orders ADD COLUMN invoice_id UUID REFERENCES invoices(id);
        CREATE INDEX idx_orders_invoice ON orders(invoice_id);
    END IF;
END $$;

-- Agregar invoice_id a bookings (si no existe)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'bookings' AND column_name = 'invoice_id'
    ) THEN
        ALTER TABLE bookings ADD COLUMN invoice_id UUID REFERENCES invoices(id);
        CREATE INDEX idx_bookings_invoice ON bookings(invoice_id);
    END IF;
END $$;

-- =====================================================
-- FUNCIÓN: Actualizar updated_at automáticamente
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para updated_at
DROP TRIGGER IF EXISTS update_establishment_afip_configs_updated_at ON establishment_afip_configs;
CREATE TRIGGER update_establishment_afip_configs_updated_at
    BEFORE UPDATE ON establishment_afip_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_establishment_afip_puntos_venta_updated_at ON establishment_afip_puntos_venta;
CREATE TRIGGER update_establishment_afip_puntos_venta_updated_at
    BEFORE UPDATE ON establishment_afip_puntos_venta
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- COMENTARIOS DE DOCUMENTACIÓN
-- =====================================================
COMMENT ON TABLE establishment_afip_configs IS 'Configuración AFIP/ARCA por establecimiento para facturación electrónica';
COMMENT ON TABLE establishment_afip_puntos_venta IS 'Puntos de venta habilitados en AFIP por establecimiento';
COMMENT ON TABLE invoices IS 'Comprobantes fiscales emitidos (facturas y notas de crédito) con CAE de AFIP';

COMMENT ON COLUMN establishment_afip_configs.encrypted_cert IS 'Certificado AFIP encriptado con AES-256-GCM (formato JSON: {iv, authTag, content})';
COMMENT ON COLUMN establishment_afip_configs.encrypted_key IS 'Clave privada AFIP encriptada con AES-256-GCM (formato JSON: {iv, authTag, content})';
COMMENT ON COLUMN establishment_afip_configs.condicion_fiscal IS 'Condición fiscal determina tipos de factura: monotributista=FC, responsable_inscripto=FA/FB';

COMMENT ON COLUMN invoices.tipo_comprobante IS 'Código AFIP: 1=Factura A, 6=Factura B, 11=Factura C, 3=NC A, 8=NC B, 13=NC C';
COMMENT ON COLUMN invoices.cliente_doc_tipo IS 'Código AFIP: 80=CUIT, 86=CUIL, 96=DNI, 99=Consumidor Final';
COMMENT ON COLUMN invoices.afip_response IS 'Respuesta completa de AFIP para auditoría y debugging';

-- =====================================================
-- FIN DE MIGRACIÓN
-- =====================================================
