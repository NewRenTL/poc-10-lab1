# Pokemon Microservices Architecture

Una arquitectura completa de microservicios para Pokemon con logging estandarizado y pruebas de carga con JMeter.

## 📋 Características

- ✅ **4 Microservicios independientes** con logs estandarizados
- ✅ **Gateway centralizado** para enrutamiento
- ✅ **Sistema de logging uniforme** con formato estándar
- ✅ **Medición de latencia** en todos los endpoints
- ✅ **Pruebas de carga JMeter** preconfiguradas
- ✅ **Docker Compose** para despliegue fácil
- ✅ **Health checks** y monitoreo

## 🏗️ Arquitectura

```
Gateway (3000)
├── Search API (3001) ──┐
├── Pokemon API (3004)  ├─ BD/Cache
├── Stats API (3002)    ├─ File Server/S3
└── Images API (3003) ──┘
```

### Microservicios

1. **Gateway (Puerto 3000)** - Punto de entrada principal y proxy
2. **Search API (Puerto 3001)** - Orquesta búsquedas completas
3. **Pokemon API (Puerto 3004)** - Datos de PokeAPI externa
4. **Stats API (Puerto 3002)** - Estadísticas de Pokemon (Kaggle dataset)
5. **Images API (Puerto 3003)** - Gestión de imágenes (Kaggle dataset)

## 📊 Sistema de Logging

### Formato Estándar
```
{Fecha} [MODULO] [API][FUNCION] Message {metadata}
```

**Ejemplo:**
```
2025-05-28 10:30:15.123 [SEARCH_API] [SEARCH_API][POKEMON_SEARCH] Searching for pokemon: pikachu {"pokemon":"pikachu"}
2025-05-28 10:30:15.456 [SEARCH_API] [SEARCH_API][POKEMON_SEARCH] Latency: 333ms {"latency":333,"startTime":1716889815123,"endTime":1716889815456}
```

### Logs por Microservicio
- `logs/gateway.log` - Logs del gateway principal
- `logs/search_api.log` - Logs del servicio de búsqueda
- `logs/poke_api.log` - Logs del servicio Pokemon
- `logs/stats_api.log` - Logs del servicio de estadísticas
- `logs/images_api.log` - Logs del servicio de imágenes

## 🚀 Instalación y Ejecución

### Requisitos Previos
- Node.js 18+
- Docker y Docker Compose (opcional)
- JMeter 5.5+ (para pruebas de carga)

### Opción 1: Ejecución Local

```bash
# 1. Clonar e instalar dependencias
git clone <repository>
cd pokemon-microservices
npm install

# 2. Crear directorio de logs
mkdir logs

# 3. Ejecutar todos los servicios (en terminales separadas)
npm run dev:poke      # Puerto 3004
npm run dev:stats     # Puerto 3002
npm run dev:images    # Puerto 3003
npm run dev:search    # Puerto 3001
npm run dev           # Gateway en puerto 3000

# O ejecutar en modo producción
npm run start:poke &
npm run start:stats &
npm run start:images &
npm run start:search &
npm start
```

### Opción 2: Docker Compose

```bash
# 1. Construir y ejecutar
docker-compose up --build

# 2. Para ejecutar en background
docker-compose up -d

# 3. Ver logs
docker-compose logs -f

# 4. Parar servicios
docker-compose down
```

## 🧪 Testing con JMeter

### Preparación

1. **Crear archivos necesarios:**
```bash
# Crear dataset de Pokemon
echo "pikachu
charizard
bulbasaur
squirtle
mewtwo
mew" > pokemon_names.csv

# Crear directorios de resultados
mkdir -p results
```

### Opción 1: Script Automático (Recomendado)

```bash
# 1. Crear y hacer ejecutable el script
touch run-jmeter-tests.sh
chmod +x run-jmeter-tests.sh

# 2. Copiar contenido del script desde el artifact "run-jmeter-tests.sh"

# 3. Ejecutar pruebas
./run-jmeter-tests.sh                    # Prueba básica
./run-jmeter-tests.sh --help             # Ver todas las opciones
./run-jmeter-tests.sh -u 100 -r 60       # 100 usuarios, 60s ramp-up
./run-jmeter-tests.sh --stress           # Prueba de stress
./run-jmeter-tests.sh --check-services   # Verificar servicios antes
```

### Opción 2: JMeter Manual

```bash
# Modo GUI (desarrollo)
jmeter -t jmeter-test-plan.jmx

# Modo comando (producción)
jmeter -n -t jmeter-test-plan.jmx -l results/results.jtl

# Con parámetros personalizados
jmeter -n -t jmeter-test-plan.jmx \
  -JUSERS=100 \
  -JRAMP_UP=60 \
  -JDURATION=300 \
  -JBASE_URL=http://localhost:3000 \
  -l results/load-test-results.jtl \
  -e -o results/html-report

# Solo generar reporte HTML desde archivo existente
jmeter -g results/results.jtl -o results/html-report
```

### Configuración de Pruebas

Las pruebas incluyen:

- **50 usuarios concurrentes** (por defecto)
- **30 segundos de ramp-up**
- **5 minutos de duración**
- **Endpoints probados:**
  - `/health` - Health check
  - `/poke/search` - Búsqueda completa
  - `/api/pokemon/{name}` - Datos Pokemon
  - `/api/stats/{name}` - Estadísticas
  - `/api/images/{name}` - Imágenes

## 📡 API Endpoints

### Gateway Principal (http://localhost:3000)

#### Información y Salud
```bash
# Información del gateway
GET /

# Health check
GET /health

# Estado de todos los servicios
GET /status

# Métricas del sistema
GET /metrics
```

#### APIs de Pokemon
```bash
# Búsqueda completa (orquesta todos los servicios)
GET /poke/search?pokemon_name=pikachu

# Datos básicos de Pokemon
GET /api/pokemon/charizard

# Estadísticas detalladas
GET /api/stats/bulbasaur

# Análisis de estadísticas
GET /api/stats/analysis/pikachu

# Imágenes
GET /api/images/squirtle

# Búsqueda de imágenes
GET /api/images/search?query=pika

# Múltiples imágenes
GET /api/images?pokemon_names=pikachu,charizard&limit=10
```

#### Testing
```bash
# Endpoint para pruebas de carga
GET /test/load/pikachu?delay=1000
```

### Ejemplos de Respuesta

#### Búsqueda Completa
```json
{
  "name": "pikachu",
  "status": {
    "poke_api": "success",
    "stats_api": "success",
    "images_api": "success"
  },
  "data": {
    "id": 25,
    "name": "pikachu",
    "types": [{"name": "electric", "slot": 1}],
    "stats": {
      "total": 320,
      "hp": 35,
      "attack": 55
    },
    "image": {
      "official_artwork": "https://...",
      "front_default": "https://..."
    }
  }
}
```

## 📈 Monitoreo y Métricas

### Logs en Tiempo Real
```bash
# Ver todos los logs
tail -f logs/*.log

# Log específico de un servicio
tail -f logs/search_api.log

# Filtrar por errores
grep "ERROR" logs/*.log

# Filtrar por latencia
grep "Latency" logs/*.log
```

### Métricas de Latencia

Cada log de latencia incluye:
- **Tiempo de inicio y fin**
- **Latencia total en ms**
- **Metadata del request**
- **Identificación del microservicio**

```
2025-05-28 10:30:15.456 [SEARCH_API] [SEARCH_API][POKEMON_SEARCH] Latency: 333ms {"latency":333,"pokemon":"pikachu"}
```

## 🔧 Configuración

### Variables de Entorno

Copia el archivo de ejemplo y personalízalo:
```bash
cp .env.example .env
```

**Variables principales:**
```bash
# Puertos de servicios
PORT=3000                    # Gateway
SEARCH_PORT=3001            # Search API
STATS_API_PORT=3002         # Stats API
IMAGES_API_PORT=3003        # Images API
POKE_API_PORT=3004          # Pokemon API

# URLs de servicios (para ejecución local)
SEARCH_API_URL=http://localhost:3001
POKE_API_URL=http://localhost:3004
STATS_API_URL=http://localhost:3002
IMAGES_API_URL=http://localhost:3003

# Para Docker (descomenta estas y comenta las de arriba)
# SEARCH_API_URL=http://search-api:3001
# POKE_API_URL=http://poke-api:3004
# STATS_API_URL=http://stats-api:3002
# IMAGES_API_URL=http://images-api:3003

# Configuración general
NODE_ENV=production
LOG_LEVEL=info
CACHE_TTL=300000            # 5 minutos

# JMeter (opcional)
JMETER_USERS=50
JMETER_RAMP_UP=30
JMETER_DURATION=300
JMETER_BASE_URL=http://localhost:3000
```

### Personalización de JMeter

En `jmeter-test-plan.jmx`, puedes modificar:

```xml
<!-- Variables del plan de pruebas -->
<elementProp name="USERS">
  <stringProp name="Argument.value">50</stringProp>  <!-- Usuarios concurrentes -->
</elementProp>
<elementProp name="RAMP_UP">
  <stringProp name="Argument.value">30</stringProp>  <!-- Tiempo de ramp-up -->
</elementProp>
<elementProp name="DURATION">
  <stringProp name="Argument.value">300</stringProp> <!-- Duración en segundos -->
</elementProp>
```

## 🐳 Docker

### Dockerfile
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]
```

### Servicios Docker
- **pokemon-gateway** - Gateway principal
- **pokemon-search-api** - API de búsqueda
- **pokemon-poke-api** - API de Pokemon
- **pokemon-stats-api** - API de estadísticas
- **pokemon-images-api** - API de imágenes
- **pokemon-redis** - Cache Redis (opcional)
- **pokemon-nginx** - Load balancer (opcional)

## 🛠️ Desarrollo

### Estructura del Proyecto
```
pokemon-microservices/
├── services/
│   ├── search-api.js      # Microservicio de búsqueda
│   ├── poke-api.js        # Microservicio Pokemon
│   ├── stats-api.js       # Microservicio de estadísticas
│   └── images-api.js      # Microservicio de imágenes
├── utils/
│   └── logger.js          # Sistema de logging
├── logs/                  # Archivos de log
├── results/               # Resultados de JMeter
├── index.js               # Gateway principal
├── docker-compose.yml     # Configuración Docker
├── jmeter-test-plan.jmx   # Plan de pruebas JMeter
└── package.json
```

### Agregar Nuevo Microservicio

1. Crear archivo en `services/`
2. Usar `StandardLogger` del módulo utils
3. Implementar health check en `/health`
4. Agregar proxy en gateway
5. Actualizar docker-compose.yml
6. Agregar pruebas en JMeter

## 🚨 Troubleshooting

### Problemas Comunes

**Error: ECONNREFUSED**
```bash
# Verificar que todos los servicios estén corriendo
curl http://localhost:3000/status
```

**Logs no aparecen**
```bash
# Verificar permisos del directorio logs
chmod 755 logs/
```

**JMeter no encuentra pokemon_names.csv**
```bash
# Crear el archivo en el directorio de JMeter
echo -e "pikachu\ncharizard\nbulbasaur" > pokemon_names.csv
```

**Timeouts en las pruebas**
```bash
# Aumentar timeouts en jmeter-test-plan.jmx
# Modificar connect_timeout y response_timeout
```

## 📚 Referencias

- **PokeAPI:** https://pokeapi.co/api/v2/pokemon/{id or name}/
- **Pokemon Stats:** https://www.kaggle.com/datasets/abcsds/pokemon/code
- **Pokemon Images:** https://www.kaggle.com/datasets/hlrhegemony/pokemon-image-dataset
- **JMeter Documentation:** https://jmeter.apache.org/usermanual/
- **Winston Logging:** https://github.com/winstonjs/winston

## 📄 Licencia

MIT License - ver archivo LICENSE para detalles.