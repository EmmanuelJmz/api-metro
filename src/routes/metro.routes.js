import {
    getWeather,
    downloadLine,
    getGeminiRoute
} from '../services/metro.service.js';

export default async function (fastify) {

    fastify.get('/weather', async (request) => {

        const { lat, lon } = request.query;

        return await getWeather(lat, lon);
    });

    fastify.get('/movilidad', async (request) => {

        const { system, line } = request.query;

        return await downloadLine(system, line);
    });

    fastify.post('/gemini', async (request) => {

        const { userQuery, userLocation } = request.body;

        return await getGeminiRoute(
            userQuery,
            userLocation
        );
    });
}