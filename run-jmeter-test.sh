#!/bin/bash

# Script básico para ejecutar JMeter
set -e

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Variables por defecto
USERS=${1:-10}
RAMP_UP=${2:-15}
DURATION=${3:-60}
BASE_URL=${4:-http://localhost:3000}

echo -e "${GREEN}🚀 Ejecutando pruebas JMeter...${NC}"
echo "- Usuarios: $USERS"
echo "- Ramp-up: $RAMP_UP segundos"
echo "- Duración: $DURATION segundos"
echo "- URL Base: $BASE_URL"

# Crear directorio de resultados
mkdir -p results

# Timestamp para archivos únicos
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
RESULTS_FILE="results/pokemon-test-$TIMESTAMP.jtl"
REPORT_DIR="results/html-report-$TIMESTAMP"

# Ejecutar JMeter
jmeter -n -t jmeter-test-plan.jmx \
  -JUSERS=$USERS \
  -JRAMP_UP=$RAMP_UP \
  -JDURATION=$DURATION \
  -JBASE_URL=$BASE_URL \
  -l "$RESULTS_FILE" \
  -e -o "$REPORT_DIR"

echo -e "${GREEN}✅ Prueba completada!${NC}"
echo "📊 Resultados: $RESULTS_FILE"
echo "🌐 Reporte HTML: $REPORT_DIR/index.html"