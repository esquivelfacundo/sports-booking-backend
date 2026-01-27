/**
 * Invoice Model
 * Stores electronic invoices (comprobantes) emitted through AFIP/ARCA
 * All data is IMMUTABLE after emission - invoices can only be cancelled with NC
 */
module.exports = (sequelize, DataTypes) => {
  const Invoice = sequelize.define('Invoice', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    establishmentId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'establishment_id',
      references: {
        model: 'establishments',
        key: 'id'
      }
    },
    afipConfigId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'afip_config_id',
      references: {
        model: 'establishment_afip_configs',
        key: 'id'
      }
    },
    puntoVentaId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'punto_venta_id',
      references: {
        model: 'establishment_afip_puntos_venta',
        key: 'id'
      }
    },
    // AFIP data (IMMUTABLE after emission)
    cae: {
      type: DataTypes.STRING(14),
      allowNull: false,
      comment: 'Código de Autorización Electrónica from AFIP'
    },
    caeVencimiento: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'cae_vencimiento',
      comment: 'CAE expiration date'
    },
    tipoComprobante: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'tipo_comprobante',
      comment: '1=FA, 6=FB, 11=FC, 3=NCA, 8=NCB, 13=NCC'
    },
    tipoComprobanteNombre: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'tipo_comprobante_nombre',
      comment: 'Human readable: "Factura A", "Nota de Crédito C", etc.'
    },
    numeroComprobante: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'numero_comprobante',
      comment: 'Sequential invoice number'
    },
    puntoVenta: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'punto_venta',
      comment: 'Point of sale number (denormalized for quick access)'
    },
    fechaEmision: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'fecha_emision'
    },
    // Amounts
    importeTotal: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      field: 'importe_total'
    },
    importeNeto: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      field: 'importe_neto'
    },
    importeIva: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
      field: 'importe_iva'
    },
    importeTributos: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
      field: 'importe_tributos'
    },
    // Client/Recipient data
    clienteNombre: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'cliente_nombre'
    },
    clienteDocTipo: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'cliente_doc_tipo',
      comment: '80=CUIT, 86=CUIL, 96=DNI, 99=Consumidor Final'
    },
    clienteDocNro: {
      type: DataTypes.STRING(20),
      allowNull: false,
      field: 'cliente_doc_nro',
      comment: 'Document number (0 for Consumidor Final)'
    },
    clienteCondicionIva: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'cliente_condicion_iva',
      comment: '1=RI, 4=Exento, 5=CF, 6=Monotrib'
    },
    // Items (JSONB for flexibility)
    items: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      comment: 'Array of {descripcion, cantidad, precioUnitario, subtotal}'
    },
    // Relations to invoiced entities
    orderId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'order_id',
      references: {
        model: 'orders',
        key: 'id'
      },
      comment: 'Related kiosk/direct sale order'
    },
    bookingId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'booking_id',
      references: {
        model: 'bookings',
        key: 'id'
      },
      comment: 'Related court booking'
    },
    // For Credit Notes: reference to original invoice
    comprobanteAsociadoId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'comprobante_asociado_id',
      references: {
        model: 'invoices',
        key: 'id'
      },
      comment: 'Original invoice for NC (credit notes)'
    },
    motivoNc: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'motivo_nc',
      comment: 'Reason for credit note'
    },
    // Status
    status: {
      type: DataTypes.ENUM('emitido', 'anulado'),
      defaultValue: 'emitido',
      comment: 'emitido = valid, anulado = cancelled by NC'
    },
    anuladoPorId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'anulado_por_id',
      references: {
        model: 'invoices',
        key: 'id'
      },
      comment: 'NC that cancelled this invoice'
    },
    // PDF
    pdfUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'pdf_url'
    },
    pdfGeneratedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'pdf_generated_at'
    },
    // Full AFIP response for audit
    afipResponse: {
      type: DataTypes.JSONB,
      allowNull: false,
      field: 'afip_response',
      comment: 'Complete response from AFIP for audit trail'
    },
    // Audit (no updatedAt - invoices are immutable)
    createdById: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by_id',
      references: {
        model: 'users',
        key: 'id'
      }
    }
  }, {
    tableName: 'invoices',
    timestamps: true,
    updatedAt: false, // Invoices are immutable
    indexes: [
      {
        unique: true,
        fields: ['afip_config_id', 'tipo_comprobante', 'punto_venta', 'numero_comprobante'],
        name: 'invoices_afip_comprobante_unique'
      },
      {
        fields: ['establishment_id']
      },
      {
        fields: ['cae']
      },
      {
        fields: ['order_id']
      },
      {
        fields: ['booking_id']
      },
      {
        fields: ['fecha_emision']
      },
      {
        fields: ['tipo_comprobante']
      },
      {
        fields: ['status']
      },
      {
        fields: ['comprobante_asociado_id']
      }
    ]
  });

  return Invoice;
};
