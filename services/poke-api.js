const express = require('express');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
const { StandardLogger, latencyMiddleware, measureExecutionTime } = require('../utils/logger');

const app = express();
const PORT = process.env.POKE_API_PORT || 3004;
const logger = new StandardLogger('POKE_API');

// Crear directorio de logs si no existe
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(latencyMiddleware(logger, 'POKE_API'));

// Cache simple en memoria
const cache = new Map();
const CACHE_TTL = 300000; // 5 minutos

// Endpoint para obtener datos de Pokemon
app.get('/api/pokemon/:identifier', async (req, res) => {
    const functionName = 'GET_POKEMON';
    const { identifier } = req.params;

    if (!identifier) {
        logger.logApiError('POKE_API', functionName, 'Missing Pokemon identifier');
        return res.status(400).json({ error: 'Pokemon identifier is required' });
    }

    try {
        const result = await measureExecutionTime(
            logger,
            'POKE_API',
            functionName,
            async () => {
                logger.logApiCall('POKE_API', functionName, `Fetching Pokemon: ${identifier}`);

                // Verificar cache
                const cacheKey = `pokemon_${identifier.toLowerCase()}`;
                const cached = cache.get(cacheKey);
                
                if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
                    logger.logApiCall('POKE_API', functionName, `Cache hit for: ${identifier}`);
                    return cached.data;
                }

                // Llamada a PokeAPI externa
                const pokeApiUrl = `https://pokeapi.co/api/v2/pokemon/${identifier.toLowerCase()}`;
                logger.logApiCall('POKE_API', functionName, `Calling external API: ${pokeApiUrl}`);

                const response = await axios.get(pokeApiUrl, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Pokemon-Microservice/1.0'
                    }
                });

                // Procesar y filtrar datos relevantes
                const pokemonData = {
                    id: response.data.id,
                    name: response.data.name,
                    height: response.data.height,
                    weight: response.data.weight,
                    base_experience: response.data.base_experience,
                    types: response.data.types.map(type => ({
                        name: type.type.name,
                        slot: type.slot
                    })),
                    abilities: response.data.abilities.map(ability => ({
                        name: ability.ability.name,
                        is_hidden: ability.is_hidden,
                        slot: ability.slot
                    })),
                    stats: response.data.stats.map(stat => ({
                        name: stat.stat.name,
                        base_stat: stat.base_stat,
                        effort: stat.effort
                    })),
                    sprites: {
                        front_default: response.data.sprites.front_default,
                        front_shiny: response.data.sprites.front_shiny,
                        back_default: response.data.sprites.back_default,
                        back_shiny: response.data.sprites.back_shiny
                    }
                };

                // Guardar en cache
                cache.set(cacheKey, {
                    data: pokemonData,
                    timestamp: Date.now()
                });

                logger.logApiCall('POKE_API', functionName, `Data cached for: ${identifier}`);
                return pokemonData;
            },
            { pokemon: identifier }
        );

        logger.logApiCall('POKE_API', functionName, `Successfully fetched: ${identifier}`, {
            pokemon_id: result.id,
            pokemon_name: result.name
        });

        res.json(result);

    } catch (error) {
        if (error.response && error.response.status === 404) {
            logger.logApiWarning('POKE_API', functionName, `Pokemon not found: ${identifier}`);
            return res.status(404).json({ 
                error: 'Pokemon not found', 
                pokemon: identifier 
            });
        }

        logger.logApiError('POKE_API', functionName, 'Failed to fetch Pokemon data', error, {
            pokemon: identifier,
            error_status: error.response?.status,
            error_code: error.code
        });

        res.status(500).json({ 
            error: 'Failed to fetch Pokemon data', 
            message: error.message 
        });
    }
});

// Endpoint para obtener lista de Pokemon (útil para testing)
app.get('/api/pokemon', async (req, res) => {
    const functionName = 'LIST_POKEMON';
    const { limit = 20, offset = 0 } = req.query;

    try {
        const result = await measureExecutionTime(
            logger,
            'POKE_API',
            functionName,
            async () => {
                const pokeApiUrl = `https://pokeapi.co/api/v2/pokemon?limit=${limit}&offset=${offset}`;
                logger.logApiCall('POKE_API', functionName, `Fetching Pokemon list: limit=${limit}, offset=${offset}`);

                const response = await axios.get(pokeApiUrl, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Pokemon-Microservice/1.0'
                    }
                });

                return {
                    count: response.data.count,
                    next: response.data.next,
                    previous: response.data.previous,
                    results: response.data.results
                };
            },
            { limit, offset }
        );

        logger.logApiCall('POKE_API', functionName, `Successfully fetched Pokemon list`, {
            count: result.results.length,
            total: result.count
        });

        res.json(result);

    } catch (error) {
        logger.logApiError('POKE_API', functionName, 'Failed to fetch Pokemon list', error);
        res.status(500).json({ 
            error: 'Failed to fetch Pokemon list', 
            message: error.message 
        });
    }
});

// Endpoint de cache stats
app.get('/api/cache/stats', (req, res) => {
    const functionName = 'CACHE_STATS';
    logger.logApiCall('POKE_API', functionName, 'Cache stats requested');

    const stats = {
        size: cache.size,
        entries: Array.from(cache.keys()),
        service: 'poke-api',
        timestamp: new Date().toISOString()
    };

    res.json(stats);
});

// Limpiar cache
app.delete('/api/cache', (req, res) => {
    const functionName = 'CLEAR_CACHE';
    const sizeBefore = cache.size;
    
    cache.clear();
    
    logger.logApiCall('POKE_API', functionName, `Cache cleared`, {
        entries_removed: sizeBefore
    });

    res.json({ 
        message: 'Cache cleared successfully', 
        entries_removed: sizeBefore 
    });
});

// Health check
app.get('/health', (req, res) => {
    logger.logApiCall('POKE_API', 'HEALTH_CHECK', 'Health check requested');
    res.json({ 
        service: 'poke-api', 
        status: 'healthy', 
        cache_size: cache.size,
        timestamp: new Date().toISOString() 
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    logger.logApiError('POKE_API', 'MIDDLEWARE_ERROR', 'Unhandled error', error);
    res.status(500).json({ error: 'Internal server error' });
});

// Limpiar cache periódicamente
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, value] of cache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
            cache.delete(key);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        logger.logApiCall('POKE_API', 'CACHE_CLEANUP', `Cleaned expired cache entries`, {
            entries_cleaned: cleaned,
            remaining_entries: cache.size
        });
    }
}, 60000); // Cada minuto

app.listen(PORT, () => {
    logger.logApiCall('POKE_API', 'SERVER_START', `Pokemon API server running on port ${PORT}`);
});

module.exports = app;