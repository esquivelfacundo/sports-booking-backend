const express = require('express');
const router = express.Router();
const { Product, ProductCategory, StockMovement, Establishment } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');

// Get all products for an establishment
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { establishmentId } = req.query;
    const { categoryId, search, isActive } = req.query;

    if (!establishmentId) {
      return res.status(400).json({ error: 'establishmentId is required' });
    }

    // Verify user has access to this establishment
    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }

    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const where = { establishmentId };

    if (categoryId && categoryId !== 'all') {
      where.categoryId = categoryId;
    }

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { barcode: { [Op.iLike]: `%${search}%` } },
        { sku: { [Op.iLike]: `%${search}%` } }
      ];
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const products = await Product.findAll({
      where,
      include: [
        {
          model: ProductCategory,
          as: 'category',
          attributes: ['id', 'name', 'color', 'icon']
        }
      ],
      order: [['name', 'ASC']]
    });

    res.json({ products });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Export inventory to CSV - MUST be before /:id route
router.get('/export', authenticateToken, async (req, res) => {
  try {
    const { establishmentId, categoryId, stockStatus } = req.query;

    if (!establishmentId) {
      return res.status(400).json({ error: 'Establishment ID is required' });
    }

    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }

    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const where = { establishmentId, isActive: true };

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (stockStatus === 'low') {
      where.currentStock = { [Op.lte]: sequelize.col('minStock') };
    } else if (stockStatus === 'critical') {
      where.currentStock = { [Op.eq]: 0 };
    }

    const products = await Product.findAll({
      where,
      include: [
        { model: ProductCategory, as: 'category', attributes: ['name'] }
      ],
      order: [['name', 'ASC']]
    });

    const csvUtils = require('../utils/csvGenerator');
    csvUtils.validateDataSize(products);

    const csvData = products.map(product => {
      const productStatus = product.currentStock === 0 ? 'Sin Stock' :
        product.currentStock <= product.minStock ? 'Stock Bajo' : 'Normal';
      const valorTotal = (product.currentStock || 0) * (product.costPrice || 0);
      
      return {
        producto: product.name,
        categoria: product.category?.name || '-',
        sku: product.sku || '-',
        stockActual: product.currentStock || 0,
        stockMinimo: product.minStock || 0,
        stockMaximo: product.maxStock || '-',
        costoUnitario: csvUtils.formatNumberForCSV(product.costPrice),
        valorTotal: csvUtils.formatNumberForCSV(valorTotal),
        estado: productStatus,
        precio: csvUtils.formatNumberForCSV(product.salePrice)
      };
    });

    const fields = [
      { label: 'Producto', value: 'producto' },
      { label: 'Categoría', value: 'categoria' },
      { label: 'SKU', value: 'sku' },
      { label: 'Stock Actual', value: 'stockActual' },
      { label: 'Stock Mínimo', value: 'stockMinimo' },
      { label: 'Stock Máximo', value: 'stockMaximo' },
      { label: 'Costo Unitario', value: 'costoUnitario' },
      { label: 'Valor Total', value: 'valorTotal' },
      { label: 'Estado', value: 'estado' },
      { label: 'Precio Venta', value: 'precio' }
    ];

    const csv = csvUtils.generateCSV(csvData, fields);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `inventario_${establishment.slug || establishmentId}_${dateStr}.csv`;

    csvUtils.sendCSVResponse(res, csv, filename);
  } catch (error) {
    console.error('Error exporting inventory:', error);
    res.status(500).json({ error: 'Failed to export inventory', message: error.message });
  }
});

// Get single product
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id, {
      include: [
        {
          model: ProductCategory,
          as: 'category'
        }
      ]
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Verify access
    const establishment = await Establishment.findByPk(product.establishmentId);
    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ product });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Create product
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      establishmentId,
      categoryId,
      name,
      description,
      barcode,
      sku,
      image,
      costPrice,
      salePrice,
      currentStock,
      minStock,
      maxStock,
      unit,
      trackStock
    } = req.body;

    // Verify access
    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }

    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Calculate profit margin
    const profitMargin = costPrice > 0 
      ? ((salePrice - costPrice) / costPrice * 100).toFixed(2)
      : 0;

    const product = await Product.create({
      establishmentId,
      categoryId: categoryId || null,
      name,
      description,
      barcode,
      sku,
      image,
      costPrice: costPrice || 0,
      salePrice: salePrice || 0,
      profitMargin,
      currentStock: currentStock || 0,
      minStock: minStock || 0,
      maxStock,
      unit: unit || 'unidad',
      trackStock: trackStock !== false
    });

    // If initial stock > 0, create stock movement
    if (currentStock > 0) {
      await StockMovement.create({
        establishmentId,
        productId: product.id,
        userId: req.user.id,
        type: 'entrada',
        quantity: currentStock,
        previousStock: 0,
        newStock: currentStock,
        unitCost: costPrice,
        totalCost: costPrice * currentStock,
        reason: 'Stock inicial'
      });
    }

    const createdProduct = await Product.findByPk(product.id, {
      include: [
        {
          model: ProductCategory,
          as: 'category'
        }
      ]
    });

    res.status(201).json({ product: createdProduct });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Update product
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Verify access
    const establishment = await Establishment.findByPk(product.establishmentId);
    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const {
      categoryId,
      name,
      description,
      barcode,
      sku,
      image,
      costPrice,
      salePrice,
      minStock,
      maxStock,
      unit,
      trackStock,
      isActive
    } = req.body;

    // Calculate profit margin if prices changed
    let profitMargin = product.profitMargin;
    const newCostPrice = costPrice !== undefined ? costPrice : product.costPrice;
    const newSalePrice = salePrice !== undefined ? salePrice : product.salePrice;
    
    if (newCostPrice > 0) {
      profitMargin = ((newSalePrice - newCostPrice) / newCostPrice * 100).toFixed(2);
    }

    await product.update({
      categoryId: categoryId !== undefined ? categoryId : product.categoryId,
      name: name || product.name,
      description: description !== undefined ? description : product.description,
      barcode: barcode !== undefined ? barcode : product.barcode,
      sku: sku !== undefined ? sku : product.sku,
      image: image !== undefined ? image : product.image,
      costPrice: newCostPrice,
      salePrice: newSalePrice,
      profitMargin,
      minStock: minStock !== undefined ? minStock : product.minStock,
      maxStock: maxStock !== undefined ? maxStock : product.maxStock,
      unit: unit || product.unit,
      trackStock: trackStock !== undefined ? trackStock : product.trackStock,
      isActive: isActive !== undefined ? isActive : product.isActive
    });

    const updatedProduct = await Product.findByPk(product.id, {
      include: [
        {
          model: ProductCategory,
          as: 'category'
        }
      ]
    });

    res.json({ product: updatedProduct });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete product
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Verify access
    const establishment = await Establishment.findByPk(product.establishmentId);
    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Soft delete - just mark as inactive
    await product.update({ isActive: false });

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Get products with low stock
router.get('/alerts/low-stock', authenticateToken, async (req, res) => {
  try {
    const { establishmentId } = req.query;

    if (!establishmentId) {
      return res.status(400).json({ error: 'establishmentId is required' });
    }

    // Verify access
    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }

    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const products = await Product.findAll({
      where: {
        establishmentId,
        isActive: true,
        trackStock: true,
        currentStock: {
          [Op.lte]: Product.sequelize.col('minStock')
        }
      },
      include: [
        {
          model: ProductCategory,
          as: 'category'
        }
      ],
      order: [['currentStock', 'ASC']]
    });

    res.json({ products });
  } catch (error) {
    console.error('Error fetching low stock products:', error);
    res.status(500).json({ error: 'Failed to fetch low stock products' });
  }
});

// Download import template CSV
router.get('/import/template', authenticateToken, async (req, res) => {
  try {
    const csvUtils = require('../utils/csvGenerator');
    
    // Create template with example data
    const templateData = [
      {
        nombre: 'Producto Ejemplo',
        descripcion: 'Descripción del producto',
        codigo_barras: '7790001000012',
        sku: 'SKU001',
        categoria: 'Bebidas',
        precio_costo: '100.00',
        precio_venta: '150.00',
        stock_inicial: '10',
        stock_minimo: '5',
        stock_maximo: '50',
        unidad: 'unidad'
      }
    ];

    const fields = [
      { label: 'nombre', value: 'nombre' },
      { label: 'descripcion', value: 'descripcion' },
      { label: 'codigo_barras', value: 'codigo_barras' },
      { label: 'sku', value: 'sku' },
      { label: 'categoria', value: 'categoria' },
      { label: 'precio_costo', value: 'precio_costo' },
      { label: 'precio_venta', value: 'precio_venta' },
      { label: 'stock_inicial', value: 'stock_inicial' },
      { label: 'stock_minimo', value: 'stock_minimo' },
      { label: 'stock_maximo', value: 'stock_maximo' },
      { label: 'unidad', value: 'unidad' }
    ];

    const csv = csvUtils.generateCSV(templateData, fields);
    csvUtils.sendCSVResponse(res, csv, 'plantilla_productos.csv');
  } catch (error) {
    console.error('Error generating template:', error);
    res.status(500).json({ error: 'Failed to generate template' });
  }
});

// Import products from CSV
router.post('/import', authenticateToken, async (req, res) => {
  try {
    const { establishmentId, products } = req.body;

    if (!establishmentId) {
      return res.status(400).json({ error: 'establishmentId is required' });
    }

    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: 'products array is required' });
    }

    // Verify access
    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }

    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get existing categories for this establishment
    const categories = await ProductCategory.findAll({
      where: { establishmentId }
    });
    const categoryMap = {};
    categories.forEach(cat => {
      categoryMap[cat.name.toLowerCase().trim()] = cat.id;
    });

    const results = {
      success: 0,
      errors: [],
      created: []
    };

    // Process each product
    for (let i = 0; i < products.length; i++) {
      const row = products[i];
      const rowNumber = i + 2; // +2 because row 1 is header

      try {
        // Validate required field (name)
        const name = row.nombre?.toString().trim();
        if (!name) {
          results.errors.push({ row: rowNumber, error: 'El nombre es requerido' });
          continue;
        }

        // Parse optional fields with null handling
        const description = row.descripcion?.toString().trim() || null;
        const barcode = row.codigo_barras?.toString().trim() || null;
        const sku = row.sku?.toString().trim() || null;
        const categoryName = row.categoria?.toString().trim() || null;
        const costPrice = parseFloat(row.precio_costo) || 0;
        const salePrice = parseFloat(row.precio_venta) || 0;
        const currentStock = parseInt(row.stock_inicial) || 0;
        const minStock = parseInt(row.stock_minimo) || 0;
        const maxStock = row.stock_maximo ? parseInt(row.stock_maximo) : null;
        const unit = row.unidad?.toString().trim() || 'unidad';

        // Find or create category if provided
        let categoryId = null;
        if (categoryName) {
          const existingCategoryId = categoryMap[categoryName.toLowerCase()];
          if (existingCategoryId) {
            categoryId = existingCategoryId;
          } else {
            // Create new category
            const newCategory = await ProductCategory.create({
              establishmentId,
              name: categoryName,
              color: '#6B7280'
            });
            categoryId = newCategory.id;
            categoryMap[categoryName.toLowerCase()] = categoryId;
          }
        }

        // Check if product with same barcode already exists
        if (barcode) {
          const existingProduct = await Product.findOne({
            where: { establishmentId, barcode }
          });
          if (existingProduct) {
            results.errors.push({ row: rowNumber, error: `Ya existe un producto con código de barras ${barcode}` });
            continue;
          }
        }

        // Calculate profit margin
        const profitMargin = costPrice > 0 
          ? ((salePrice - costPrice) / costPrice * 100).toFixed(2)
          : 0;

        // Create product
        const product = await Product.create({
          establishmentId,
          categoryId,
          name,
          description,
          barcode,
          sku,
          costPrice,
          salePrice,
          profitMargin,
          currentStock,
          minStock,
          maxStock,
          unit,
          trackStock: true,
          isActive: true
        });

        // If initial stock > 0, create stock movement
        if (currentStock > 0) {
          await StockMovement.create({
            establishmentId,
            productId: product.id,
            userId: req.user.id,
            type: 'entrada',
            quantity: currentStock,
            previousStock: 0,
            newStock: currentStock,
            unitCost: costPrice,
            totalCost: costPrice * currentStock,
            reason: 'Importación masiva'
          });
        }

        results.success++;
        results.created.push({ id: product.id, name: product.name });

      } catch (rowError) {
        console.error(`Error importing row ${rowNumber}:`, rowError);
        results.errors.push({ row: rowNumber, error: rowError.message });
      }
    }

    res.json({
      message: `Importación completada: ${results.success} productos creados`,
      ...results
    });

  } catch (error) {
    console.error('Error importing products:', error);
    res.status(500).json({ error: 'Failed to import products', message: error.message });
  }
});

// Export low stock products to CSV
router.get('/alerts/low-stock/export', authenticateToken, async (req, res) => {
  try {
    const { establishmentId } = req.query;

    if (!establishmentId) {
      return res.status(400).json({ error: 'establishmentId is required' });
    }

    const establishment = await Establishment.findByPk(establishmentId);
    if (!establishment) {
      return res.status(404).json({ error: 'Establishment not found' });
    }

    if (establishment.userId !== req.user.id && req.user.userType !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const products = await Product.findAll({
      where: {
        establishmentId,
        isActive: true,
        trackStock: true,
        currentStock: {
          [Op.lte]: sequelize.col('minStock')
        }
      },
      include: [
        { model: ProductCategory, as: 'category' }
      ],
      order: [['currentStock', 'ASC']]
    });

    const csvUtils = require('../utils/csvGenerator');

    const csvData = products.map(product => {
      const diferencia = product.minStock - product.currentStock;
      let estado = 'Normal';
      if (product.currentStock === 0) estado = 'Sin Stock';
      else if (product.currentStock <= product.minStock * 0.5) estado = 'Crítico';
      else estado = 'Bajo';

      return {
        producto: product.name,
        categoria: product.category?.name || '-',
        sku: product.sku || '-',
        stockActual: product.currentStock,
        stockMinimo: product.minStock,
        diferencia: diferencia,
        estado: estado,
        costoUnitario: csvUtils.formatNumberForCSV(product.costPrice),
        valorFaltante: csvUtils.formatNumberForCSV(diferencia * (product.costPrice || 0))
      };
    });

    const fields = [
      { label: 'Producto', value: 'producto' },
      { label: 'Categoría', value: 'categoria' },
      { label: 'SKU', value: 'sku' },
      { label: 'Stock Actual', value: 'stockActual' },
      { label: 'Stock Mínimo', value: 'stockMinimo' },
      { label: 'Diferencia', value: 'diferencia' },
      { label: 'Estado', value: 'estado' },
      { label: 'Costo Unitario', value: 'costoUnitario' },
      { label: 'Valor Faltante', value: 'valorFaltante' }
    ];

    const csv = csvUtils.generateCSV(csvData, fields);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `productos_stock_bajo_${establishment.slug || establishmentId}_${dateStr}.csv`;

    csvUtils.sendCSVResponse(res, csv, filename);
  } catch (error) {
    console.error('Error exporting low stock products:', error);
    res.status(500).json({ error: 'Failed to export', message: error.message });
  }
});

module.exports = router;
