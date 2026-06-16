import {
    getWeather,
    downloadLine,
    getGeminiRoute,
    getIncidents,
    createIncident
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
        return await getGeminiRoute(userQuery, userLocation);
    });

    fastify.get('/incidents', async (request, reply) => {
        return await getIncidents();
    });

    fastify.post('/incidents', async (request, reply) => {
        const parts = request.parts();
        let fields = {};
        let imageBuffer = null;
        let mimeType = '';

        for await (const part of parts) {
            if (part.file) {
                imageBuffer = await part.toBuffer();
                mimeType = part.mimetype;
            } else {
                fields[part.fieldname] = part.value;
            }
        }

        const result = await createIncident(fields, imageBuffer, mimeType);
        
        if (result.error) {
            return reply.code(result.statusCode || 400).send({ error: result.error });
        }

        return reply.code(201).send(result);
    });
}
