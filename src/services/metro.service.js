import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

export async function getWeather(lat, lon) {
    const response = await axios.get(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric&lang=es`
    );
    return response.data;
}

export async function downloadLine(system, line) {
    const apiLine = (system.toUpperCase() === 'METRO' && line === '12') ? 'L12' : line;
    const [stationRes, pathRes] = await Promise.all([
        axios.get(
            `https://apimetro.dev/movilidad/mapas/geojsonEstacion?sistema=${system}&num_comercial=${apiLine}`
        ),
        axios.get(
            `https://apimetro.dev/movilidad/mapas/geojsonLinea?sistema=${system}&num_comercial=${apiLine}`
        )
    ]);
    return {
        stations: stationRes.data,
        path: pathRes.data
    };
}

export async function getGeminiRoute(userQuery, userLocation) {
    const locationPrompt = userLocation
        ? `Las coordenadas actuales del usuario son: Latitud: ${userLocation.latitude}, Longitud: ${userLocation.longitude}.`
        : 'No se dispone de la ubicación GPS actual del usuario.';

    const prompt = `
Eres el asistente de navegación de Metro Radar CDMX.
Petición del usuario: "${userQuery}"
${locationPrompt}
Si la petición no tiene relación con transporte público en CDMX responde indicando que sólo puedes ayudar con navegación y rutas.
Retorna SIEMPRE JSON válido.
`;

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
      },
      { headers: { 'Content-Type': 'application/json' } }
    );

    const textResponse = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) return null;
    return JSON.parse(textResponse);
}

export async function getIncidents() {
    if (!supabase) return [];

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
        .from('incidents')
        .select('*')
        .gt('created_at', yesterday)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error al consultar Supabase:", error);
        return [];
    }
    return data;
}

async function moderateIncidentImage(imageBuffer, mimeType) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return true; 

        const base64Image = imageBuffer.toString('base64');
        const prompt = "Analiza esta imagen de un reporte de transporte público en CDMX. ¿Muestra algún problema real, retraso, tren averiado, andén lleno, inundación o infraestructura con fallas? Responde estrictamente un JSON con formato: {\"valid\": true} si es apta y real, o {\"valid\": false} si contiene violencia, desnudez, odio, spam o cosas que no tienen relación con el transporte público.";

        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            {
                contents: [{
                    parts: [
                        { text: prompt },
                        { inlineData: { mimeType, data: base64Image } }
                    ]
                }],
                generationConfig: { responseMimeType: 'application/json' }
            },
            { headers: { 'Content-Type': 'application/json' } }
        );

        const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) return true;
        const result = JSON.parse(text);
        return result.valid === true;
    } catch (e) {
        console.error("Error al moderar imagen:", e);
        return true;
    }
}

export async function createIncident(fields, imageBuffer, mimeType) {
    if (!supabase) {
        return { error: 'El servicio de base de datos no está inicializado.', statusCode: 500 };
    }

    const { station_id, system, comment, device_id } = fields;

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recent, error: spamErr } = await supabase
        .from('incidents')
        .select('id')
        .eq('device_id', device_id)
        .gt('created_at', oneHourAgo);

    if (spamErr) {
        console.error("Error validando spam:", spamErr);
    } else if (recent && recent.length >= 2) {
        return { error: 'Límite de spam alcanzado. Intenta de nuevo más tarde.', statusCode: 429 };
    }

    if (imageBuffer) {
        const isOk = await moderateIncidentImage(imageBuffer, mimeType);
        if (!isOk) {
            return { error: 'La foto fue rechazada por nuestro sistema de moderación automática (Spam o contenido inapropiado).', statusCode: 400 };
        }
    }

    let imageUrl = null;

    if (imageBuffer) {
        const ext = mimeType.split('/')[1] || 'jpg';
        const fileName = `incidents/${system}_${station_id}_${Date.now()}.${ext}`.toLowerCase().replace(/\s+/g, '_');

        const { data: uploadData, error: uploadErr } = await supabase.storage
            .from('incidents')
            .upload(fileName, imageBuffer, {
                contentType: mimeType,
                duplex: 'half'
            });

        if (uploadErr) {
            console.error("Error subiendo imagen a Supabase:", uploadErr);
            return { error: 'Error al subir la imagen al servidor.', statusCode: 500 };
        }

        const { data: { publicUrl } } = supabase.storage
            .from('incidents')
            .getPublicUrl(fileName);

        imageUrl = publicUrl;
    }

    const { data, error } = await supabase
        .from('incidents')
        .insert([{
            station_id,
            system: system.toUpperCase(),
            comment,
            image_url: imageUrl,
            device_id
        }])
        .select();

    if (error) {
        console.error("Error guardando reporte:", error);
        return { error: 'Error al guardar los datos del incidente.', statusCode: 500 };
    }

    return { success: true, report: data[0] };
}
