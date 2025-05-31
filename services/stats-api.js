const express = require('express');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { StandardLogger, latencyMiddleware, measureExecutionTime } = require('../utils/logger');

const app = express();
const PORT = process.env.STATS_API_PORT || 3002;
const logger = new StandardLogger('STATS_API');

const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(latencyMiddleware(logger, 'STATS_API'));

let pokemonStatsDB = new Map();
let isDataLoaded = false;

const samplePokemonStats = [
    { name: 'pikachu', total: 320, hp: 35, attack: 55, defense: 40, sp_attack: 50, sp_defense: 50, speed: 90, generation: 1, legendary: false },
    { name: 'charizard', total: 534, hp: 78, attack: 84, defense: 78, sp_attack: 109, sp_defense: 85, speed: 100, generation: 1, legendary: false },
    { name: 'bulbasaur', total: 318, hp: 45, attack: 49, defense: 49, sp_attack: 65, sp_defense: 65, speed: 45, generation: 1, legendary: false },
    { name: 'squirtle', total: 314, hp: 44, attack: 48, defense: 65, sp_attack: 50, sp_defense: 64, speed: 43, generation: 1, legendary: false },
    { name: 'mewtwo', total: 680, hp: 106, attack: 110, defense: 90, sp_attack: 154, sp_defense: 90, speed: 130, generation: 1, legendary: true },
    { name: 'mew', total: 600, hp: 100, attack: 100, defense: 100, sp_attack: 100, sp_defense: 100, speed: 100, generation: 1, legendary: true }
];

async function initializeStatsData() {
    return await measureExecutionTime(
        logger,
        'STATS_API',
        'INITIALIZE_DATA',
        async () => {
            logger.logApiCall('STATS_API', 'INITIALIZE_DATA', 'Loading Pokemon stats data');

            // ESTE SERIA EL CSV DE KAGGLE
            // const csvPath = path.join(__dirname, '../data/pokemon.csv');
            
            // Por ahora usamos datos de ejemplo
            samplePokemonStats.forEach(pokemon => {
                pokemonStatsDB.set(pokemon.name.toLowerCase(), pokemon);
            });

            isDataLoaded = true;
            
            logger.logApiCall('STATS_API', 'INITIALIZE_DATA', 'Sample data loaded successfully', {
                total_pokemon: pokemonStatsDB.size
            });

            return pokemonStatsDB.size;
        }
    );
}

app.get('/api/stats/:pokemonName', async (req, res) => {
    const functionName = 'GET_POKEMON_STATS';
    const { pokemonName } = req.params;

    if (!pokemonName) {
        logger.logApiError('STATS_API', functionName, 'Missing Pokemon name parameter');
        return res.status(400).json({ error: 'Pokemon name is required' });
    }

    try {
        const result = await measureExecutionTime(
            logger,
            'STATS_API',
            functionName,
            async () => {
                logger.logApiCall('STATS_API', functionName, `Fetching stats for: ${pokemonName}`);

                if (!isDataLoaded) {
                    await initializeStatsData();
                }

                const pokemonKey = pokemonName.toLowerCase();
                const stats = pokemonStatsDB.get(pokemonKey);

                if (!stats) {
                    logger.logApiWarning('STATS_API', functionName, `No local stats found for: ${pokemonName}, generating mock data`);
                    
                    const mockStats = generateMockStats(pokemonName);
                    pokemonStatsDB.set(pokemonKey, mockStats);
                    return mockStats;
                }

                return stats;
            },
            { pokemon: pokemonName }
        );

        logger.logApiCall('STATS_API', functionName, `Successfully fetched stats for: ${pokemonName}`, {
            pokemon: pokemonName,
            total_stats: result.total,
            legendary: result.legendary
        });

        res.json(result);

    } catch (error) {
        logger.logApiError('STATS_API', functionName, 'Failed to fetch Pokemon stats', error, {
            pokemon: pokemonName
        });

        res.status(500).json({ 
            error: 'Failed to fetch Pokemon stats', 
            message: error.message 
        });
    }
});

function generateMockStats(pokemonName) {
    const baseStats = {
        hp: Math.floor(Math.random() * 100) + 20,
        attack: Math.floor(Math.random() * 100) + 20,
        defense: Math.floor(Math.random() * 100) + 20,
        sp_attack: Math.floor(Math.random() * 100) + 20,
        sp_defense: Math.floor(Math.random() * 100) + 20,
        speed: Math.floor(Math.random() * 100) + 20
    };

    const total = Object.values(baseStats).reduce((sum, stat) => sum + stat, 0);

    return {
        name: pokemonName.toLowerCase(),
        total: total,
        ...baseStats,
        generation: Math.floor(Math.random() * 8) + 1,
        legendary: Math.random() > 0.95, 
        type1: 'normal', 
        type2: null
    };
}

app.get('/api/stats', async (req, res) => {
    const functionName = 'GET_ALL_STATS';
    const { limit = 50, offset = 0, generation, legendary } = req.query;

    try {
        const result = await measureExecutionTime(
            logger,
            'STATS_API',
            functionName,
            async () => {
                logger.logApiCall('STATS_API', functionName, 'Fetching multiple Pokemon stats', {
                    limit, offset, generation, legendary
                });

                if (!isDataLoaded) {
                    await initializeStatsData();
                }

                let pokemonList = Array.from(pokemonStatsDB.values());

                if (generation) {
                    pokemonList = pokemonList.filter(p => p.generation == generation);
                }

                if (legendary !== undefined) {
                    const isLegendary = legendary === 'true';
                    pokemonList = pokemonList.filter(p => p.legendary === isLegendary);
                }

                const startIndex = parseInt(offset);
                const endIndex = startIndex + parseInt(limit);
                const paginatedList = pokemonList.slice(startIndex, endIndex);

                return {
                    total: pokemonList.length,
                    offset: parseInt(offset),
                    limit: parseInt(limit),
                    data: paginatedList
                };
            },
            { limit, offset, generation, legendary }
        );

        logger.logApiCall('STATS_API', functionName, 'Successfully fetched Pokemon stats list', {
            returned_count: result.data.length,
            total_available: result.total
        });

        res.json(result);

    } catch (error) {
        logger.logApiError('STATS_API', functionName, 'Failed to fetch Pokemon stats list', error);
        res.status(500).json({ 
            error: 'Failed to fetch Pokemon stats list', 
            message: error.message 
        });
    }
});

app.get('/api/stats/analysis/:pokemonName', async (req, res) => {
    const functionName = 'ANALYZE_POKEMON_STATS';
    const { pokemonName } = req.params;

    try {
        const result = await measureExecutionTime(
            logger,
            'STATS_API',
            functionName,
            async () => {
                logger.logApiCall('STATS_API', functionName, `Analyzing stats for: ${pokemonName}`);

                if (!isDataLoaded) {
                    await initializeStatsData();
                }

                const pokemonKey = pokemonName.toLowerCase();
                const pokemon = pokemonStatsDB.get(pokemonKey);

                if (!pokemon) {
                    throw new Error(`Pokemon ${pokemonName} not found`);
                }

                const allPokemon = Array.from(pokemonStatsDB.values());
                const analysis = {
                    pokemon: pokemon,
                    rankings: {
                        total_ranking: calculateRanking(allPokemon, 'total', pokemon.total),
                        hp_ranking: calculateRanking(allPokemon, 'hp', pokemon.hp),
                        attack_ranking: calculateRanking(allPokemon, 'attack', pokemon.attack),
                        defense_ranking: calculateRanking(allPokemon, 'defense', pokemon.defense),
                        speed_ranking: calculateRanking(allPokemon, 'speed', pokemon.speed)
                    },
                    percentiles: {
                        total_percentile: calculatePercentile(allPokemon, 'total', pokemon.total),
                        hp_percentile: calculatePercentile(allPokemon, 'hp', pokemon.hp),
                        attack_percentile: calculatePercentile(allPokemon, 'attack', pokemon.attack),
                        defense_percentile: calculatePercentile(allPokemon, 'defense', pokemon.defense),
                        speed_percentile: calculatePercentile(allPokemon, 'speed', pokemon.speed)
                    },
                    strengths: identifyStrengths(pokemon),
                    weaknesses: identifyWeaknesses(pokemon)
                };

                return analysis;
            },
            { pokemon: pokemonName }
        );

        logger.logApiCall('STATS_API', functionName, `Successfully analyzed stats for: ${pokemonName}`, {
            pokemon: pokemonName,
            total_ranking: result.rankings.total_ranking
        });

        res.json(result);

    } catch (error) {
        if (error.message.includes('not found')) {
            logger.logApiWarning('STATS_API', functionName, `Pokemon not found: ${pokemonName}`);
            return res.status(404).json({ 
                error: 'Pokemon not found', 
                pokemon: pokemonName 
            });
        }

        logger.logApiError('STATS_API', functionName, 'Failed to analyze Pokemon stats', error, {
            pokemon: pokemonName
        });

        res.status(500).json({ 
            error: 'Failed to analyze Pokemon stats', 
            message: error.message 
        });
    }
});

function calculateRanking(allPokemon, stat, value) {
    const sortedValues = allPokemon.map(p => p[stat]).sort((a, b) => b - a);
    return sortedValues.indexOf(value) + 1;
}

function calculatePercentile(allPokemon, stat, value) {
    const values = allPokemon.map(p => p[stat]).sort((a, b) => a - b);
    const index = values.indexOf(value);
    return Math.round((index / values.length) * 100);
}

function identifyStrengths(pokemon) {
    const stats = ['hp', 'attack', 'defense', 'sp_attack', 'sp_defense', 'speed'];
    const strengths = [];
    
    stats.forEach(stat => {
        if (pokemon[stat] > 80) {
            strengths.push({ stat, value: pokemon[stat], level: 'high' });
        } else if (pokemon[stat] > 60) {
            strengths.push({ stat, value: pokemon[stat], level: 'moderate' });
        }
    });
    
    return strengths.sort((a, b) => b.value - a.value);
}

function identifyWeaknesses(pokemon) {
    const stats = ['hp', 'attack', 'defense', 'sp_attack', 'sp_defense', 'speed'];
    const weaknesses = [];
    
    stats.forEach(stat => {
        if (pokemon[stat] < 40) {
            weaknesses.push({ stat, value: pokemon[stat], level: 'low' });
        } else if (pokemon[stat] < 60) {
            weaknesses.push({ stat, value: pokemon[stat], level: 'moderate' });
        }
    });
    
    return weaknesses.sort((a, b) => a.value - b.value);
}

app.post('/api/stats/load-csv', async (req, res) => {
    const functionName = 'LOAD_CSV_DATA';
    
    try {
        const result = await measureExecutionTime(
            logger,
            'STATS_API',
            functionName,
            async () => {
                logger.logApiCall('STATS_API', functionName, 'Loading CSV data');

                // const csvPath = path.join(__dirname, '../data/pokemon.csv');
                // return await loadCsvData(csvPath);
                
                // Por ahora solo reinicializamos los datos de ejemplo
                pokemonStatsDB.clear();
                await initializeStatsData();
                
                return { loaded: pokemonStatsDB.size };
            }
        );

        logger.logApiCall('STATS_API', functionName, 'CSV data loaded successfully', {
            pokemon_count: result.loaded
        });

        res.json({ 
            message: 'Data loaded successfully', 
            pokemon_count: result.loaded 
        });

    } catch (error) {
        logger.logApiError('STATS_API', functionName, 'Failed to load CSV data', error);
        res.status(500).json({ 
            error: 'Failed to load CSV data', 
            message: error.message 
        });
    }
});

app.get('/health', (req, res) => {
    logger.logApiCall('STATS_API', 'HEALTH_CHECK', 'Health check requested');
    res.json({ 
        service: 'stats-api', 
        status: 'healthy', 
        data_loaded: isDataLoaded,
        pokemon_count: pokemonStatsDB.size,
        timestamp: new Date().toISOString() 
    });
});

app.use((error, req, res, next) => {
    logger.logApiError('STATS_API', 'MIDDLEWARE_ERROR', 'Unhandled error', error);
    res.status(500).json({ error: 'Internal server error' });
});

initializeStatsData().catch(error => {
    logger.logApiError('STATS_API', 'SERVER_INIT', 'Failed to initialize data', error);
});

app.listen(PORT, () => {
    logger.logApiCall('STATS_API', 'SERVER_START', `Stats API server running on port ${PORT}`);
});

module.exports = app;