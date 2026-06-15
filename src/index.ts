import { OMSSServer } from '@omss/framework';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { knownThirdPartyProxies } from './thirdPartyProxies.js';
import { streamPatterns } from './streamPatterns.js';

// Cloudflare Workers environment binding
interface Env {
    TMDB_API_KEY: string;
    REDIS_HOST?: string;
    REDIS_PORT?: string;
    REDIS_PASSWORD?: string;
    HOST?: string;
    PORT?: string;
    NODE_ENV?: string;
    CACHE_TYPE?: 'memory' | 'redis';
    PUBLIC_URL?: string;
    STREMIO_ADDON?: string;
    CORS_ORIGIN?: string;
    MCP_ENABLED?: string;
    CINEPRO_CACHE?: KVNamespace;
}

// Create the server instance
async function createServer(env: Env) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const server = new OMSSServer({
        name: 'CinePro',
        version: '1.0.0',

        // Network - Using default for Workers
        host: '0.0.0.0',
        port: 3000, // Workers ignores this

        publicUrl:
            env.PUBLIC_URL ||
            'https://cinepro.workers.dev',

        // Cache configuration
        cache: {
            type: (env.CACHE_TYPE as 'memory' | 'redis') || 'memory',
            ttl: {
                sources: 60 * 60,
                subtitles: 60 * 60 * 24
            },
            ...(env.CACHE_TYPE === 'redis' && {
                redis: {
                    host: env.REDIS_HOST || 'localhost',
                    port: Number(env.REDIS_PORT || 6379),
                    password: env.REDIS_PASSWORD
                }
            })
        },

        // TMDB configuration
        tmdb: {
            apiKey: env.TMDB_API_KEY,
            cacheTTL: 24 * 60 * 60 // 24 hours
        },

        // Third Party Proxy configuration
        proxyConfig: {
            knownThirdPartyProxies: knownThirdPartyProxies,
            streamPatterns
        },

        // CORS configuration
        cors: {
            origin: env.CORS_ORIGIN || '*',
            methods: ['GET', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization'],
            exposedHeaders: ['Content-Range', 'Accept-Ranges', 'ETag'],
            preflightContinue: false,
            optionsSuccessStatus: 204
        },

        // Stremio configuration
        stremio: {
            enableNativeAddon: env.STREMIO_ADDON === 'true',
            stremioAddons: []
        },

        // MCP configuration
        mcp: {
            enabled: env.MCP_ENABLED === 'true'
        }
    });

    // Register providers
    const registry = server.getRegistry();
    await registry.discoverProviders(
        path.join(__dirname, './providers/')
    );

    return server;
}

// Main export for Cloudflare Workers
export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        try {
            const server = await createServer(env);

            // Print startup info once
            const publicUrl = env.PUBLIC_URL || 'https://cinepro.workers.dev';
            const uiUrl = `https://ui.cinepro.cc/?omssurl=${encodeURIComponent(publicUrl)}`;

            console.log(
                `🚀 CinePro running on ${publicUrl}`
            );
            console.log(
                `🌐 Try it out: ${uiUrl}`
            );

            // Handle the request
            return await server.handleRequest(request);
        } catch (error) {
            console.error('Worker error:', error);

            return new Response(
                JSON.stringify({
                    error: 'Internal Server Error',
                    message:
                        error instanceof Error
                            ? error.message
                            : 'Unknown error'
                }),
                {
                    status: 500,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );
        }
    },

    // Optional: Handle scheduled events
    async scheduled(
        event: ScheduledEvent,
        env: Env
    ): Promise<void> {
        try {
            console.log('Running scheduled task...');
            // Add your scheduled task logic here
            // e.g., cache refresh, cleanup, etc.
        } catch (error) {
            console.error('Scheduled task error:', error);
        }
    }
};

interface ScheduledEvent {
    cron: string;
    scheduledTime: number;
}
