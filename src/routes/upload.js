const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { authenticateToken } = require('../middleware/auth');
const { Establishment } = require('../models');
const cloudinary = require('../config/cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const router = express.Router();

// Use Cloudinary in production, local storage in development
const useCloudinary = process.env.NODE_ENV === 'production' && process.env.CLOUDINARY_CLOUD_NAME;

// Define directories for local storage (always define, even if using Cloudinary)
const uploadsDir = path.join(__dirname, '../../uploads');
const establishmentsDir = path.join(uploadsDir, 'establishments');

let storage;
if (useCloudinary) {
  // Cloudinary storage for production
  storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'miscanchas/establishments',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
      transformation: [{ width: 1920, height: 1080, crop: 'limit' }]
    }
  });
} else {
  // Local storage for development
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  if (!fs.existsSync(establishmentsDir)) {
    fs.mkdirSync(establishmentsDir, { recursive: true });
  }
  
  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, establishmentsDir);
    },
    filename: (req, file, cb) => {
      const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    }
  });
}

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, WebP and GIF are allowed.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Upload single image
router.post('/image', authenticateToken, upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const imageUrl = useCloudinary ? req.file.path : `/uploads/establishments/${req.file.filename}`;
    
    res.json({
      success: true,
      url: imageUrl,
      filename: req.file.filename
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Upload multiple images
router.post('/images', authenticateToken, upload.array('images', 10), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const urls = req.files.map(file => useCloudinary ? file.path : `/uploads/establishments/${file.filename}`);
    
    res.json({
      success: true,
      urls,
      count: req.files.length
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload images' });
  }
});

// Delete image
router.delete('/image/:filename', authenticateToken, (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(establishmentsDir, filename);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ success: true, message: 'Image deleted' });
    } else {
      res.status(404).json({ error: 'Image not found' });
    }
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

// Upload establishment logo
router.post('/logo/:establishmentId', authenticateToken, (req, res, next) => {
  upload.single('logo')(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({ error: err.message || 'File upload error' });
    }
    next();
  });
}, async (req, res) => {
  try {
    const { establishmentId } = req.params;
    
    console.log('Logo upload request for establishment:', establishmentId);
    console.log('File received:', req.file);
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const establishment = await Establishment.findByPk(establishmentId);
    
    if (!establishment) {
      // Delete uploaded file if establishment not found
      fs.unlinkSync(path.join(establishmentsDir, req.file.filename));
      return res.status(404).json({ error: 'Establishment not found' });
    }

    // Delete old logo if exists (only for local files, not Cloudinary URLs)
    if (establishment.logo && !establishment.logo.startsWith('http')) {
      const oldLogoPath = path.join(establishmentsDir, path.basename(establishment.logo));
      if (fs.existsSync(oldLogoPath)) {
        try {
          fs.unlinkSync(oldLogoPath);
        } catch (e) {
          console.log('Could not delete old logo:', e.message);
        }
      }
    }

    const logoUrl = useCloudinary ? req.file.path : `/uploads/establishments/${req.file.filename}`;
    
    await establishment.update({ logo: logoUrl });
    
    console.log('Logo updated successfully:', logoUrl);
    
    res.json({
      success: true,
      url: logoUrl,
      message: 'Logo updated successfully'
    });
  } catch (error) {
    console.error('Logo upload error:', error);
    res.status(500).json({ error: 'Failed to upload logo', message: error.message });
  }
});

module.exports = router;
