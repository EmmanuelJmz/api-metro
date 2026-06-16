import axios from 'axios';

export async function getWeather(lat, lon) {

    const response = await axios.get(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric&lang=es`
    );

    return response.data;
}

export async function downloadLine(system, line) {

    const [stationRes, pathRes] = await Promise.all([
        axios.get(
            `https://apimetro.dev/movilidad/mapas/geojsonEstacion?sistema=${system}&num_comercial=${line}`
        ),
        axios.get(
            `https://apimetro.dev/movilidad/mapas/geojsonLinea?sistema=${system}&num_comercial=${line}`
        )
    ]);

    return {
        stations: stationRes.data,
        path: pathRes.data
    };
}

export async function getGeminiRoute(
    userQuery,
    userLocation
) {

    const locationPrompt = userLocation
        ? `Las coordenadas actuales del usuario son: Latitud: ${userLocation.latitude}, Longitud: ${userLocation.longitude}.`
        : 'No se dispone de la ubicación GPS actual del usuario.';

    const prompt = `
Eres el asistente de navegación de Metro Radar CDMX.

Petición del usuario:
"${userQuery}"

${locationPrompt}

Si la petición no tiene relación con transporte público en CDMX responde indicando que sólo puedes ayudar con navegación y rutas.

Retorna SIEMPRE JSON válido.
`;

    const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
            contents: [
                {
                    parts: [
                        {
                            text: prompt
                        }
                    ]
                }
            ],
            generationConfig: {
                responseMimeType: 'application/json'
            }
        },
        {
            headers: {
                'Content-Type': 'application/json'
            }
        }
    );

    const textResponse =
        response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResponse) {
        return null;
    }

    return JSON.parse(textResponse);
}