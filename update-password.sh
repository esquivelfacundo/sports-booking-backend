#!/bin/bash
# Script para actualizar la contraseña del superadmin
# Ejecutar en Railway: bash update-password.sh

echo "🔐 Actualizando contraseña del superadmin..."
echo ""

node src/scripts/updateSuperAdminPassword.js

echo ""
echo "✅ Proceso completado"
