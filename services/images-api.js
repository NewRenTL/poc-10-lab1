const express = require('express');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
const { StandardLogger, latencyMiddleware, measureExecutionTime } = require('../utils/logger');

const app = express();
const PORT = process.env.IMAGES_API_PORT || 3003;
const logger = new StandardLogger('IMAGES_API');

// Crear directorio de logs si no existe
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(latencyMiddleware(logger, 'IMAGES_API'));

// Simulación de base de datos de imágenes (normalmente vendría del dataset de Kaggle)
const pokemonImages = new Map();

// Datos de ejemplo de URLs de imágenes (en un caso real serían rutas locales o S3)
const sampleImageData = [
    {
        name: 'pikachu',
        images: {
            official_artwork: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png',
            front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png',
            front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/25.png',
            back_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/25.png',
            back_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/shiny/25.png'
        },
        metadata: {
            resolution: '475x475',
            format: 'png',
            size_kb: 45,
            last_updated: '2024-01-15'
        }
    },
    {
        name: 'charizard',
        images: {
            official_artwork: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/6.png',
            front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/6.png',
            front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/6.png',
            back_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/6.png',
            back_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/shiny/6.png'
        },
        metadata: {
            resolution: '475x475',
            format: 'png',
            size_kb: 62,
            last_updated: '2024-01-15'
        }
    },
    {
        name: 'bulbasaur',
        images: {
            official_artwork: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/1.png',
            front_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png',
            front_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/1.png',
            back_default: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/1.png',
            back_shiny: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/shiny/1.png'
        },
        metadata: {
            resolution: '475x475',
            format: 'png',
            size_kb: 38,
            last_updated: '2024-01-15'
        }
    }
];

// Inicializar datos de ejemplo
function initializeImageData() {
    logger.logApiCall('IMAGES_API', 'INITIALIZE_DATA', 'Loading Pokemon image data');
    
    sampleImageData.forEach(pokemon => {
        pokemonImages.set(pokemon.name.toLowerCase(), pokemon);
    });
    
    logger.logApiCall('IMAGES_API', 'INITIALIZE_DATA', 'Image data loaded successfully', {
        total_pokemon: pokemonImages.size
    });
}

// Endpoint para obtener imágenes de un Pokemon específico
app.get('/api/images/:pokemonName', async (req, res) => {
    const functionName = 'GET_POKEMON_IMAGES';
    const { pokemonName } = req.params;
    const { type = 'all', format = 'json' } = req.query;

    if (!pokemonName) {
        logger.logApiError('IMAGES_API', functionName, 'Missing Pokemon name parameter');
        return res.status(400).json({ error: 'Pokemon name is required' });
    }

    try {
        const result = await measureExecutionTime(
            logger,
            'IMAGES_API',
            functionName,
            async () => {
                logger.logApiCall('IMAGES_API', functionName, `Fetching images for: ${pokemonName}`, {
                    type, format
                });

                const pokemonKey = pokemonName.toLowerCase();
                let pokemonData = pokemonImages.get(pokemonKey);

                if (!pokemonData) {
                    // Si no tenemos datos locales, generar URLs basadas en el nombre
                    logger.logApiWarning('IMAGES_API', functionName, `No local images found for: ${pokemonName}, generating fallback URLs`);
                    pokemonData = generateFallbackImages(pokemonName);
                    pokemonImages.set(pokemonKey, pokemonData);
                }

                // Validar URLs de imágenes
                const validatedImages = await validateImageUrls(pokemonData.images);

                const response = {
                    name: pokemonData.name,
                    images: type === 'all' ? validatedImages : { [type]: validatedImages[type] },
                    metadata: {
                        ...pokemonData.metadata,
                        validation_timestamp: new Date().toISOString(),
                        requested_type: type,
                        format: format
                    }
                };

                return response;
            },
            { pokemon: pokemonName, type, format }
        );

        logger.logApiCall('IMAGES_API', functionName, `Successfully fetched images for: ${pokemonName}`, {
            pokemon: pokemonName,
            image_count: Object.keys(result.images).length,
            type: type
        });

        res.json(result);

    } catch (error) {
        logger.logApiError('IMAGES_API', functionName, 'Failed to fetch Pokemon images', error, {
            pokemon: pokemonName
        });

        res.status(500).json({ 
            error: 'Failed to fetch Pokemon images', 
            message: error.message 
        });
    }
});

// Función para validar que las URLs de imágenes estén disponibles
async function validateImageUrls(images) {
    const validatedImages = {};
    
    for (const [key, url] of Object.entries(images)) {
        try {
            const response = await axios.head(url, { timeout: 3000 });
            validatedImages[key] = {
                url: url,
                status: 'available',
                content_type: response.headers['content-type'],
                content_length: response.headers['content-length']
            };
        } catch (error) {
            validatedImages[key] = {
                url: url,
                status: 'unavailable',
                error: error.message
            };
        }
    }
    
    return validatedImages;
}

// Función para generar URLs de imágenes fallback
function generateFallbackImages(pokemonName) {
    // En un caso real, esto buscaría en el dataset de Kaggle o generaría IDs
    const pokemonId = Math.floor(Math.random() * 1000) + 1; // ID aleatorio para demo
    
    return {
        name: pokemonName.toLowerCase(),
        images: {
            official_artwork: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pokemonId}.png`,
            front_default: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemonId}.png`,
            front_shiny: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${pokemonId}.png`,
            back_default: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/${pokemonId}.png`,
            back_shiny: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/shiny/${pokemonId}.png`
        },
        metadata: {
            resolution: '475x475',
            format: 'png',
            size_kb: 'unknown',
            last_updated: new Date().toISOString().split('T')[0],
            source: 'fallback_generated'
        }
    };
}

// Endpoint para obtener múltiples imágenes
app.get('/api/images', async (req, res) => {
    const functionName = 'GET_MULTIPLE_IMAGES';
    const { pokemon_names, limit = 10, offset = 0 } = req.query;

    try {
        const result = await measureExecutionTime(
            logger,
            'IMAGES_API',
            functionName,
            async () => {
                let pokemonList;

                if (pokemon_names) {
                    // Lista específica de Pokemon
                    const names = pokemon_names.split(',').map(name => name.trim().toLowerCase());
                    logger.logApiCall('IMAGES_API', functionName, `Fetching images for specific Pokemon`, {
                        count: names.length
                    });

                    pokemonList = names.map(name => {
                        const data = pokemonImages.get(name);
                        return data || generateFallbackImages(name);
                    });
                } else {
                    // Todos los Pokemon disponibles con paginación
                    logger.logApiCall('IMAGES_API', functionName, `Fetching paginated images`, {
                        limit, offset
                    });

                    const allPokemon = Array.from(pokemonImages.values());
                    const startIndex = parseInt(offset);
                    const endIndex = startIndex + parseInt(limit);
                    pokemonList = allPokemon.slice(startIndex, endIndex);
                }

                return {
                    total: pokemonImages.size,
                    offset: parseInt(offset),
                    limit: parseInt(limit),
                    data: pokemonList
                };
            },
            { pokemon_names, limit, offset }
        );

        logger.logApiCall('IMAGES_API', functionName, 'Successfully fetched multiple images', {
            returned_count: result.data.length,
            total_available: result.total
        });

        res.json(result);

    } catch (error) {
        logger.logApiError('IMAGES_API', functionName, 'Failed to fetch multiple images', error);
        res.status(500).json({ 
            error: 'Failed to fetch multiple images', 
            message: error.message 
        });
    }
});

// Endpoint para buscar imágenes por criterios
app.get('/api/images/search', async (req, res) => {
    const functionName = 'SEARCH_IMAGES';
    const { query, format, min_size, max_size } = req.query;

    if (!query) {
        logger.logApiError('IMAGES_API', functionName, 'Missing search query parameter');
        return res.status(400).json({ error: 'Search query is required' });
    }

    try {
        const result = await measureExecutionTime(
            logger,
            'IMAGES_API',
            functionName,
            async () => {
                logger.logApiCall('IMAGES_API', functionName, `Searching images with query: ${query}`);

                const allPokemon = Array.from(pokemonImages.values());
                let filteredPokemon = allPokemon.filter(pokemon => 
                    pokemon.name.includes(query.toLowerCase())
                );

                // Aplicar filtros adicionales
                if (format) {
                    filteredPokemon = filteredPokemon.filter(pokemon => 
                        pokemon.metadata.format === format
                    );
                }

                if (min_size) {
                    filteredPokemon = filteredPokemon.filter(pokemon => 
                        pokemon.metadata.size_kb >= parseInt(min_size)
                    );
                }

                if (max_size) {
                    filteredPokemon = filteredPokemon.filter(pokemon => 
                        pokemon.metadata.size_kb <= parseInt(max_size)
                    );
                }

                return {
                    query: query,
                    filters: { format, min_size, max_size },
                    total_results: filteredPokemon.length,
                    results: filteredPokemon
                };
            },
            { query, format, min_size, max_size }
        );

        logger.logApiCall('IMAGES_API', functionName, `Search completed for: ${query}`, {
            query: query,
            results_count: result.total_results
        });

        res.json(result);

    } catch (error) {
        logger.logApiError('IMAGES_API', functionName, 'Search failed', error, {
            query: query
        });

        res.status(500).json({ 
            error: 'Search failed', 
            message: error.message 
        });
    }
});

// Endpoint para obtener estadísticas de imágenes
app.get('/api/images/stats', async (req, res) => {
    const functionName = 'GET_IMAGE_STATS';

    try {
        const result = await measureExecutionTime(
            logger,
            'IMAGES_API',
            functionName,
            async () => {
                logger.logApiCall('IMAGES_API', functionName, 'Calculating image statistics');

                const allPokemon = Array.from(pokemonImages.values());
                
                const stats = {
                    total_pokemon: allPokemon.length,
                    total_images: allPokemon.reduce((sum, pokemon) => 
                        sum + Object.keys(pokemon.images).length, 0
                    ),
                    formats: {},
                    average_size_kb: 0,
                    resolution_distribution: {},
                    last_updated_distribution: {}
                };

                allPokemon.forEach(pokemon => {
                    // Contar formatos
                    const format = pokemon.metadata.format;
                    stats.formats[format] = (stats.formats[format] || 0) + 1;

                    // Distribución de resoluciones
                    const resolution = pokemon.metadata.resolution;
                    stats.resolution_distribution[resolution] = 
                        (stats.resolution_distribution[resolution] || 0) + 1;

                    // Distribución de fechas de actualización
                    const date = pokemon.metadata.last_updated;
                    stats.last_updated_distribution[date] = 
                        (stats.last_updated_distribution[date] || 0) + 1;
                });

                // Calcular tamaño promedio
                const totalSize = allPokemon.reduce((sum, pokemon) => {
                    const size = typeof pokemon.metadata.size_kb === 'number' 
                        ? pokemon.metadata.size_kb : 0;
                    return sum + size;
                }, 0);

                stats.average_size_kb = Math.round(totalSize / allPokemon.length);

                return stats;
            }
        );

        logger.logApiCall('IMAGES_API', functionName, 'Successfully calculated image statistics', {
            total_pokemon: result.total_pokemon,
            total_images: result.total_images
        });

        res.json(result);

    } catch (error) {
        logger.logApiError('IMAGES_API', functionName, 'Failed to calculate image statistics', error);
        res.status(500).json({ 
            error: 'Failed to calculate image statistics', 
            message: error.message 
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    logger.logApiCall('IMAGES_API', 'HEALTH_CHECK', 'Health check requested');
    res.json({ 
        service: 'images-api', 
        status: 'healthy', 
        pokemon_count: pokemonImages.size,
        timestamp: new Date().toISOString() 
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    logger.logApiError('IMAGES_API', 'MIDDLEWARE_ERROR', 'Unhandled error', error);
    res.status(500).json({ error: 'Internal server error' });
});

// Inicializar datos al arrancar el servidor
initializeImageData();

app.listen(PORT, () => {
    logger.logApiCall('IMAGES_API', 'SERVER_START', `Images API server running on port ${PORT}`);
});

module.exports = app;