import Fastify from 'fastify';
import metroRoutes from './routes/metro.routes.js';
import dotenv from 'dotenv';
dotenv.config();

const app = Fastify({
    logger: true,
})

app.register(metroRoutes, {
    prefix: '/api/v1/metro'
});

await app.listen({
    port: process.env.PORT || 3000,
    host: '0.0.0.0'
})