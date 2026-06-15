import { OMSSServer } from '@omss/framework';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { knownThirdPartyProxies } from './thirdPartyProxies.js';
import { streamPatterns } from './streamPatterns.js';

// Catatan: Impor dotenv/config dan penggunaan __dirname dari file sistem lokal telah dihapus 
// karena Cloudflare Workers tidak memiliki hardisk fisik untuk membaca file lokal secara dinamis.

let serverInstance: any = null;

async function initializeServer(env: any) {
    if (serverInstance) return serverInstance;

    const server = new OMSSServer({
        name: 'CinePro',
        version: '1.0.0',

        // Network (Diambil langsung dari parameter env Cloudflare)
        host: env.HOST ?? '0.0.0.0',
        port: Number(env.PORT ?? 3000),
        publicUrl: env.PUBLIC_URL,

        // Cache (Menggunakan Redis sesuai variabel produksi Anda)
        cache: {
            type: (env.CACHE_TYPE as 'memory' | 'redis') ?? 'redis',
            ttl: {
                sources: 60 * 60,
                subtitles: 60 * 60 * 24
            },
            redis: {
                host: env.REDIS_HOST ?? 'localhost',
                port: Number(env.REDIS_PORT ?? 6379),
                password: env.REDIS_PASSWORD
            }
        },

        // TMDB (Mengambil dari secrets Cloudflare)
        tmdb: {
            apiKey: env.TMDB_API_KEY!,
            cacheTTL: 24 * 60 * 60 // 24h
        },

        // Third Party Proxy removal
        proxyConfig: {
            knownThirdPartyProxies: knownThirdPartyProxies,
            streamPatterns
        },

        cors: {
            origin: env.CORS_ORIGIN ?? '*',
            methods: ['GET', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization'],
            exposedHeaders: ['Content-Range', 'Accept-Ranges', 'ETag'],
            preflightContinue: false,
            optionsSuccessStatus: 204
        },

        stremio: {
            enableNativeAddon: env.STREMIO_ADDON === 'true',
            stremioAddons: []
        },

        mcp: {
            enabled: env.MCP_ENABLED === 'true'
        }
    });

    // Perhatian: Karena fungsi otomatis discoverProviders() memerlukan pembacaan hardisk lokal 
    // yang dilarang di Cloudflare, server langsung dimulai menggunakan pemicu inisialisasi internal.
    await server.start();
    serverInstance = server;
    return serverInstance;
}

// Mengubah struktur utama menjadi ES Modules (export default) agar diizinkan oleh Cloudflare Workers
export default {
    async fetch(request: Request, env: any, ctx: any): Promise<Response> {
        try {
            const server = await initializeServer(env);
            
            // Mengalirkan seluruh request jaringan Cloudflare langsung ke dalam penanganan router framework OMSS
            return await server.handleRequest(request);
        } catch (error: any) {
            return new Response(JSON.stringify({
                status: 'error',
                message: error.message || 'Internal Server Error'
            }), { 
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
};
