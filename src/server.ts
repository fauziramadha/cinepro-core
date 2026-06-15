import { OMSSServer } from '@omss/framework';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { knownThirdPartyProxies } from './thirdPartyProxies.js';
import { streamPatterns } from './streamPatterns.js';

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

        // Cache (Menggunakan memori internal RAM sesuai setelan variabel terbaru Anda)
        cache: {
            type: (env.CACHE_TYPE as 'memory' | 'redis') ?? 'memory',
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

    // CATATAN: server.start() sengaja dinonaktifkan untuk mencegah error unenv (http.createServer) di Cloudflare.
    // Jalur komunikasi request akan ditangani langsung secara pasif oleh fungsi handleRequest.
    serverInstance = server;
    return serverInstance;
}

// Struktur utama ES Modules agar kompatibel penuh dengan arsitektur serverless Cloudflare
export default {
    async fetch(request: Request, env: any, ctx: any): Promise<Response> {
        const url = new URL(request.url);

        // 🛠️ PERTAHANAN RUTE: Mengembalikan format JSON operasional OMSS v1.1 resmi secara instan
        // Langkah ini memotong semua potensi benturan modul unenv pada endpoint root (/)
        if (url.pathname === '/' || url.pathname === '/v1') {
            return new Response(JSON.stringify({
                name: "CinePro",
                version: "1.0.0",
                status: "operational",
                spec: "omss"
            }), {
                status: 200,
                headers: { 
                    "Content-Type": "application/json; charset=utf-8",
                    "Access-Control-Allow-Origin": "*"
                }
            });
        }

        try {
            const server = await initializeServer(env);
            
            // Mengalirkan request jaringan masuk langsung ke penanganan router framework OMSS
            return await server.handleRequest(request);
        } catch (error: any) {
            return new Response(JSON.stringify({
                status: 'error',
                message: error.message || 'Internal Server Error'
            }), { 
                status: 500,
                headers: { 
                    'Content-Type': 'application/json',
                    "Access-Control-Allow-Origin": "*"
                }
            });
        }
    }
};
