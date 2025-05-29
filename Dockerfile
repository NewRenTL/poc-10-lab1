FROM node:20-alpine

# Información del mantenedor
LABEL maintainer="Pokemon Microservices Team"
LABEL version="1.0.0"
LABEL description="Pokemon Microservices Architecture with Express.js"

# Instalar curl para health checks
RUN apk add --no-cache curl

# Crear usuario no-root para seguridad
RUN addgroup -g 1001 -S nodejs
RUN adduser -S pokemon -u 1001

# Crear directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias de producción
RUN npm ci --only=production && npm cache clean --force

# Crear directorios necesarios
RUN mkdir -p logs data images

# Copiar código fuente
COPY --chown=pokemon:nodejs . .

# Cambiar permisos de directorios
RUN chown -R pokemon:nodejs /app
RUN chmod -R 755 /app/logs /app/data /app/images

# Cambiar a usuario no-root
USER pokemon

# Exponer puerto (será sobrescrito por docker-compose)
EXPOSE 3000

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

# Comando por defecto (será sobrescrito por docker-compose para servicios específicos)
CMD ["node", "index.js"]