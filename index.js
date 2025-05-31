const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
const { StandardLogger, latencyMiddleware } = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;
const logger = new StandardLogger('GATEWAY');

const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(latencyMiddleware(logger, 'GATEWAY'));

const MICROSERVICES = {
    SEARCH_API: process.env.SEARCH_API_URL || 'http://localhost:3001',
    STATS_API: process.env.STATS_API_URL || 'http://localhost:3002',
    IMAGES_API: process.env.IMAGES_API_URL || 'http://localhost:3003',
    POKE_API: process.env.POKE_API_URL || 'http://localhost:3004'
};

app.get('/', (req, res) => {
    logger.logApiCall('GATEWAY', 'ROOT_INFO', 'Gateway info requested');
    
    res.json({
        service: 'Pokemon Microservices Gateway',
        version: '1.0.0',
        description: 'Central gateway for Pokemon microservices architecture',
        endpoints: {
            search: '/poke/search?pokemon_name={name}',
            pokemon_data: '/api/pokemon/{name}',
            stats: '/api/stats/{name}',
            images: '/api/images/{name}',
            health: '/health',
            status: '/status'
        },
        microservices: {
            search_api: `${MICROSERVICES.SEARCH_API}/health`,
            poke_api: `${MICROSERVICES.POKE_API}/health`,
            stats_api: `${MICROSERVICES.STATS_API}/health`,
            images_api: `${MICROSERVICES.IMAGES_API}/health`
        },
        documentation: {
            search_example: '/poke/search?pokemon_name=pikachu',
            pokemon_example: '/api/pokemon/charizard',
            stats_example: '/api/stats/bulbasaur',
            images_example: '/api/images/squirtle'
        },
        timestamp: new Date().toISOString()
    });
});

app.use('/poke/search', createProxy('SEARCH_API', '/poke/search'));
app.use('/api/pokemon', createProxy('POKE_API', '/api/pokemon'));
app.use('/api/stats', createProxy('STATS_API', '/api/stats'));
app.use('/api/images', createProxy('IMAGES_API', '/api/images'));

function createProxy(serviceName, basePath) {
    return async (req, res, next) => {
        const axios = require('axios');
        const functionName = 'PROXY_REQUEST';
        
        try {
            const serviceUrl = MICROSERVICES[serviceName];
            const targetUrl = `${serviceUrl}${req.originalUrl}`;
            
            logger.logApiCall('GATEWAY', functionName, `Proxying request to ${serviceName}`, {
                service: serviceName,
                target_url: targetUrl,
                method: req.method,
                original_url: req.originalUrl
            });

            const startTime = Date.now();
            
            const response = await axios({
                method: req.method,
                url: targetUrl,
                data: req.body,
                params: req.query,
                headers: {
                    ...req.headers,
                    host: undefined 
                },
                timeout: 30000
            });

            const endTime = Date.now();
            const latency = endTime - startTime;

            logger.logApiCall('GATEWAY', functionName, `Proxy request completed for ${serviceName}`, {
                service: serviceName,
                status_code: response.status,
                latency: latency,
                response_size: JSON.stringify(response.data).length
            });

            res.status(response.status).json(response.data);

        } catch (error) {
            const errorMessage = error.response 
                ? `Service error: ${error.response.status} - ${error.response.statusText}`
                : `Network error: ${error.message}`;

            logger.logApiError('GATEWAY', functionName, `Proxy request failed for ${serviceName}`, error, {
                service: serviceName,
                error_status: error.response?.status,
                error_code: error.code,
                target_url: error.config?.url
            });

            const statusCode = error.response?.status || 503;
            res.status(statusCode).json({
                error: 'Service unavailable',
                service: serviceName,
                message: errorMessage,
                timestamp: new Date().toISOString()
            });
        }
    };
}

app.get('/status', async (req, res) => {
    const functionName = 'HEALTH_STATUS';
    const axios = require('axios');
    
    logger.logApiCall('GATEWAY', functionName, 'Checking status of all microservices');

    const startTime = Date.now();
    const status = {
        gateway: {
            status: 'healthy',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            timestamp: new Date().toISOString()
        },
        microservices: {}
    };

    // Verificar el estado de cada microservicio
    const healthChecks = Object.entries(MICROSERVICES).map(async ([serviceName, serviceUrl]) => {
        try {
            const response = await axios.get(`${serviceUrl}/health`, { timeout: 5000 });
            status.microservices[serviceName.toLowerCase()] = {
                status: 'healthy',
                url: serviceUrl,
                response_time: response.headers['x-response-time'] || 'unknown',
                data: response.data
            };
        } catch (error) {
            status.microservices[serviceName.toLowerCase()] = {
                status: 'unhealthy',
                url: serviceUrl,
                error: error.message,
                error_code: error.code
            };
        }
    });

    await Promise.all(healthChecks);

    const endTime = Date.now();
    const totalLatency = endTime - startTime;

    // Determinar estado general
    const allHealthy = Object.values(status.microservices).every(service => service.status === 'healthy');
    status.overall_status = allHealthy ? 'healthy' : 'degraded';
    status.check_duration_ms = totalLatency;

    logger.logApiCall('GATEWAY', functionName, `Status check completed`, {
        overall_status: status.overall_status,
        healthy_services: Object.values(status.microservices).filter(s => s.status === 'healthy').length,
        total_services: Object.keys(status.microservices).length,
        check_duration: totalLatency
    });

    const responseCode = allHealthy ? 200 : 503;
    res.status(responseCode).json(status);
});

app.get('/metrics', async (req, res) => {
    const functionName = 'GET_METRICS';
    
    try {
        logger.logApiCall('GATEWAY', functionName, 'Collecting metrics from all services');

        const metrics = {
            gateway: {
                uptime_seconds: process.uptime(),
                memory_usage: process.memoryUsage(),
                cpu_usage: process.cpuUsage(),
                node_version: process.version,
                platform: process.platform
            },
            microservices: {},
            timestamp: new Date().toISOString()
        };


        logger.logApiCall('GATEWAY', functionName, 'Metrics collected successfully');
        res.json(metrics);

    } catch (error) {
        logger.logApiError('GATEWAY', functionName, 'Failed to collect metrics', error);
        res.status(500).json({ 
            error: 'Failed to collect metrics', 
            message: error.message 
        });
    }
});

app.get('/test/load/:pokemonName', async (req, res) => {
    const functionName = 'LOAD_TEST';
    const { pokemonName } = req.params;
    const { delay = 0 } = req.query;

    logger.logApiCall('GATEWAY', functionName, `Load test request for: ${pokemonName}`, {
        pokemon: pokemonName,
        delay: delay
    });

    try {
        if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, parseInt(delay)));
        }

        const response = {
            pokemon: pokemonName,
            timestamp: new Date().toISOString(),
            delay_applied: parseInt(delay),
            gateway_status: 'healthy',
            test_id: Math.random().toString(36).substr(2, 9)
        };

        logger.logApiCall('GATEWAY', functionName, `Load test completed for: ${pokemonName}`, {
            pokemon: pokemonName,
            test_id: response.test_id
        });

        res.json(response);

    } catch (error) {
        logger.logApiError('GATEWAY', functionName, 'Load test failed', error, {
            pokemon: pokemonName
        });

        res.status(500).json({ 
            error: 'Load test failed', 
            message: error.message 
        });
    }
});

app.get('/health', (req, res) => {
    logger.logApiCall('GATEWAY', 'HEALTH_CHECK', 'Gateway health check requested');
    
    res.json({ 
        service: 'gateway', 
        status: 'healthy', 
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString(),
        microservices_configured: Object.keys(MICROSERVICES).length
    });
});

app.use((error, req, res, next) => {
    logger.logApiError('GATEWAY', 'GLOBAL_ERROR', 'Unhandled error in gateway', error);
    res.status(500).json({ 
        error: 'Internal gateway error',
        message: error.message,
        timestamp: new Date().toISOString()
    });
});

app.use('*', (req, res) => {
    logger.logApiWarning('GATEWAY', 'NOT_FOUND', `Route not found: ${req.originalUrl}`, {
        method: req.method,
        url: req.originalUrl,
        user_agent: req.get('User-Agent')
    });

    res.status(404).json({ 
        error: 'Route not found',
        method: req.method,
        url: req.originalUrl,
        available_endpoints: [
            '/poke/search?pokemon_name={name}',
            '/api/pokemon/{name}',
            '/api/stats/{name}',
            '/api/images/{name}',
            '/health',
            '/status',
            '/metrics'
        ],
        timestamp: new Date().toISOString()
    });
});

process.on('SIGTERM', () => {
    logger.logApiCall('GATEWAY', 'SHUTDOWN', 'Received SIGTERM, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.logApiCall('GATEWAY', 'SHUTDOWN', 'Received SIGINT, shutting down gracefully');
    process.exit(0);
});

app.listen(PORT, () => {
    logger.logApiCall('GATEWAY', 'SERVER_START', `Gateway server running on port ${PORT}`, {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        microservices: MICROSERVICES
    });
    
    console.log(`
  Pokemon Microservices Gateway Started!
  Port: ${PORT}
 Available endpoints:
   • Gateway Info: http://localhost:${PORT}/
   • Search: http://localhost:${PORT}/poke/search?pokemon_name=pikachu
   • Pokemon Data: http://localhost:${PORT}/api/pokemon/charizard
   • Stats: http://localhost:${PORT}/api/stats/bulbasaur
   • Images: http://localhost:${PORT}/api/images/squirtle
   • Health: http://localhost:${PORT}/health
   • Status: http://localhost:${PORT}/status
   • Metrics: http://localhost:${PORT}/metrics

 Configured Microservices:
   • Search API: ${MICROSERVICES.SEARCH_API}
   • Pokemon API: ${MICROSERVICES.POKE_API}
   • Stats API: ${MICROSERVICES.STATS_API}
   • Images API: ${MICROSERVICES.IMAGES_API}
    `);
});

module.exports = app;