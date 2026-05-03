require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function listModels() {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        // We have to use the REST API directly or the SDK if it exposes it.
        // The SDK might not expose listModels directly in the same way, but let's try.
        // Wait, @google/generative-ai usually does not have listModels.
        // Let's use fetch instead to call the REST endpoint.
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
        const data = await response.json();
        if (data.models) {
            console.log("Available generateContent models:");
            data.models.forEach(m => {
                if (m.supportedGenerationMethods.includes('generateContent')) {
                    console.log(m.name);
                }
            });
        } else {
            console.log("Error:", data);
        }
    } catch (e) {
        console.error(e);
    }
}

listModels();
