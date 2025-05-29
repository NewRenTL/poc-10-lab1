const express = require('express');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
const { StandardLogger, latencyMiddleware, measureExecutionTime } = require('../utils/logger');

const app = express();
const PORT = process.env.SEARCH_PORT || 3001;
const logger = new StandardLogger('SEARCH_API');

// Crear directorio de logs si no existe
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(latencyMiddleware(logger, 'SEARCH_API'));

const POKE_API_URL = process.env.POKE_API_URL || 'http://localhost:3004';
const STATS_API_URL = process.env.STATS_API_URL || 'http://localhost:3002';
const IMAGES_API_URL = process.env.IMAGES_API_URL || 'http://localhost:3003';

// Endpoint principal de búsqueda
app.get('/poke/search', async (req, res) => {
    const functionName = 'POKEMON_SEARCH';
    const { pokemon_name } = req.query;

    if (!pokemon_name) {
        logger.logApiError('SEARCH_API', functionName, 'Missing pokemon_name parameter');
        return res.status(400).json({ error: 'pokemon_name parameter is required' });
    }

    try {
        const result = await measureExecutionTime(
            logger,
            'SEARCH_API',
            functionName,
            async () => {
                logger.logApiCall('SEARCH_API', functionName, `Searching for pokemon: ${pokemon_name}`);

                // Llamadas paralelas a los microservicios
                const promises = [
                    fetchPokemonData(pokemon_name),
                    fetchPokemonStats(pokemon_name),
                    fetchPokemonImage(pokemon_name)
                ];

                const [pokeData, statsData, imageData] = await Promise.allSettled(promises);

                // Procesar resultados
                const response = {
                    name: pokemon_name,
                    status: {},
                    data: {}
                };

                if (pokeData.status === 'fulfilled') {
                    response.data = { ...response.data, ...pokeData.value };
                    response.status.poke_api = 'success';
                } else {
                    response.status.poke_api = 'error';
                    response.data.poke_api_error = pokeData.reason.message;
                }

                if (statsData.status === 'fulfilled') {
                    response.data.stats = statsData.value;
                    response.status.stats_api = 'success';
                } else {
                    response.status.stats_api = 'error';
                    response.data.stats_error = statsData.reason.message;
                }

                if (imageData.status === 'fulfilled') {
                    response.data.image = imageData.value;
                    response.status.images_api = 'success';
                } else {
                    response.status.images_api = 'error';
                    response.data.image_error = imageData.reason.message;
                }

                return response;
            },
            { pokemon: pokemon_name }
        );

        logger.logApiCall('SEARCH_API', functionName, `Search completed for: ${pokemon_name}`, { 
            result: result.status 
        });

        res.json(result);

    } catch (error) {
        logger.logApiError('SEARCH_API', functionName, 'Search failed', error);
        res.status(500).json({ 
            error: 'Internal server error', 
            message: error.message 
        });
    }
});

// Función para obtener datos del Pokemon API
async function fetchPokemonData(pokemonName) {
    return await measureExecutionTime(
        logger,
        'SEARCH_API',
        'FETCH_POKEMON_DATA',
        async () => {
            const response = await axios.get(`${POKE_API_URL}/api/pokemon/${pokemonName}`, {
                timeout: 5000
            });
            return response.data;
        },
        { pokemon: pokemonName, service: 'POKE_API' }
    );
}

// Función para obtener estadísticas
async function fetchPokemonStats(pokemonName) {
    return await measureExecutionTime(
        logger,
        'SEARCH_API',
        'FETCH_POKEMON_STATS',
        async () => {
            const response = await axios.get(`${STATS_API_URL}/api/stats/${pokemonName}`, {
                timeout: 5000
            });
            return response.data;
        },
        { pokemon: pokemonName, service: 'STATS_API' }
    );
}

// Función para obtener imágenes
async function fetchPokemonImage(pokemonName) {
    return await measureExecutionTime(
        logger,
        'SEARCH_API',
        'FETCH_POKEMON_IMAGE',
        async () => {
            const response = await axios.get(`${IMAGES_API_URL}/api/images/${pokemonName}`, {
                timeout: 5000
            });
            return response.data;
        },
        { pokemon: pokemonName, service: 'IMAGES_API' }
    );
}

// Health check
app.get('/health', (req, res) => {
    logger.logApiCall('SEARCH_API', 'HEALTH_CHECK', 'Health check requested');
    res.json({ 
        service: 'search-api', 
        status: 'healthy', 
        timestamp: new Date().toISOString() 
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    logger.logApiError('SEARCH_API', 'MIDDLEWARE_ERROR', 'Unhandled error', error);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
    logger.logApiCall('SEARCH_API', 'SERVER_START', `Search API server running on port ${PORT}`);
});

module.exports = app;