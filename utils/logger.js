const winston = require('winston');
const path = require('path');

class StandardLogger {
    constructor(moduleName) {
        this.moduleName = moduleName;
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
                winston.format.errors({ stack: true }),
                winston.format.json(),
                winston.format.printf(({ timestamp, level, message, ...meta }) => {
                    return `${timestamp} [${this.moduleName}] ${level.toUpperCase()}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
                })
            ),
            transports: [
                new winston.transports.File({ 
                    filename: path.join(__dirname, '../logs', `${moduleName.toLowerCase()}-error.log`), 
                    level: 'error' 
                }),
                new winston.transports.File({ 
                    filename: path.join(__dirname, '../logs', `${moduleName.toLowerCase()}.log`) 
                }),
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.simple(),
                        winston.format.printf(({ timestamp, level, message, ...meta }) => {
                            return `${timestamp} [${this.moduleName}] ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
                        })
                    )
                })
            ]
        });
    }

    logApiCall(api, functionName, message, metadata = {}) {
        const standardMessage = `[${api}][${functionName}] ${message}`;
        this.logger.info(standardMessage, metadata);
    }

    logApiError(api, functionName, message, error = null, metadata = {}) {
        const standardMessage = `[${api}][${functionName}] ERROR: ${message}`;
        const errorMetadata = error ? { ...metadata, error: error.message, stack: error.stack } : metadata;
        this.logger.error(standardMessage, errorMetadata);
    }

    logApiWarning(api, functionName, message, metadata = {}) {
        const standardMessage = `[${api}][${functionName}] WARNING: ${message}`;
        this.logger.warn(standardMessage, metadata);
    }

    logLatency(api, functionName, startTime, endTime, additionalData = {}) {
        const latency = endTime - startTime;
        const message = `[${api}][${functionName}] Latency: ${latency}ms`;
        this.logger.info(message, { latency, startTime, endTime, ...additionalData });
    }

    // Métodos básicos de Winston
    info(message, metadata = {}) {
        this.logger.info(message, metadata);
    }

    error(message, metadata = {}) {
        this.logger.error(message, metadata);
    }

    warn(message, metadata = {}) {
        this.logger.warn(message, metadata);
    }

    debug(message, metadata = {}) {
        this.logger.debug(message, metadata);
    }
}

const latencyMiddleware = (logger, apiName) => {
    return (req, res, next) => {
        const startTime = Date.now();
        const originalEnd = res.end;

        res.end = function(...args) {
            const endTime = Date.now();
            const latency = endTime - startTime;
            
            logger.logApiCall(
                apiName, 
                'REQUEST_COMPLETED', 
                `${req.method} ${req.originalUrl} - ${res.statusCode}`,
                {
                    method: req.method,
                    url: req.originalUrl,
                    statusCode: res.statusCode,
                    latency: latency,
                    userAgent: req.get('User-Agent'),
                    ip: req.ip
                }
            );

            originalEnd.apply(this, args);
        };

        logger.logApiCall(
            apiName, 
            'REQUEST_STARTED', 
            `${req.method} ${req.originalUrl}`,
            {
                method: req.method,
                url: req.originalUrl,
                userAgent: req.get('User-Agent'),
                ip: req.ip
            }
        );

        next();
    };
};

const measureExecutionTime = async (logger, api, functionName, asyncFunction, additionalData = {}) => {
    const startTime = Date.now();
    logger.logApiCall(api, functionName, 'Execution started');
    
    try {
        const result = await asyncFunction();
        const endTime = Date.now();
        logger.logLatency(api, functionName, startTime, endTime, additionalData);
        return result;
    } catch (error) {
        const endTime = Date.now();
        logger.logApiError(api, functionName, 'Execution failed', error, { 
            executionTime: endTime - startTime,
            ...additionalData 
        });
        throw error;
    }
};

module.exports = {
    StandardLogger,
    latencyMiddleware,
    measureExecutionTime
};