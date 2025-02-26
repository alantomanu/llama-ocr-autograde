import express from 'express';
import Together from "together-ai";
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = 3000;

app.use(express.json());

async function ocr({ imageUrl, apiKey = process.env.TOGETHER_API_KEY, model = "Llama-3.2-90B-Vision" }) {
    if (!imageUrl.startsWith("http")) {
        throw new Error("Invalid image URL");
    }

    const together = new Together({ apiKey });

    const output = await together.chat.completions.create({
        model: `meta-llama/${model}-Instruct-Turbo`,
        messages: [
            {
                role: "user",
                content: [
                    { type: "text", text: "just print margin number and answers as it is for valuation, no formatting or extra text." },
                    { type: "image_url", image_url: { url: imageUrl } },
                ],
            },
        ],
    });

    return formatAnswersToJson(output?.choices[0]?.message?.content || "");
}

function formatAnswersToJson(text) {
    const answers = [];
    const lines = text.split("\n");
    let currentMarginNumber = null;
    let currentAnswer = [];

    for (const line of lines) {
        const match = line.match(/^\s*(\d+)\.\s+(.*)$/); // Match margin number and answer
        if (match) {
            if (currentMarginNumber !== null) {
                answers.push({ marginNumber: parseInt(currentMarginNumber), answer: currentAnswer.join(" ").trim() });
            }
            currentMarginNumber = match[1];
            currentAnswer = [match[2]];
        } else if (currentMarginNumber !== null) {
            currentAnswer.push(line);
        }
    }

    if (currentMarginNumber !== null) {
        answers.push({ marginNumber: parseInt(currentMarginNumber), answer: currentAnswer.join(" ").trim() });
    }

    return { answers };
}

app.post('/process-image', async (req, res) => {
    try {
        const { imageUrl } = req.body;
        console.log('Received request with imageUrl:', imageUrl);

        if (!imageUrl) {
            console.log('No imageUrl provided');
            return res.status(400).json({ error: 'Image URL is required' });
        }

        // Download the image
        console.log('Downloading image...');
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        console.log('Image downloaded successfully');

        const imageBuffer = Buffer.from(response.data, 'binary');

        // Convert image buffer to base64
        const base64Image = imageBuffer.toString('base64');
        const finalImageUrl = `data:image/jpeg;base64,${base64Image}`;
        console.log('Image converted to base64');

        // Process the image using Together AI
        console.log('Processing image with Together AI...');
        const together = new Together({ apiKey: process.env.TOGETHER_API_KEY });
        const visionLLM = 'meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo';

        const output = await together.chat.completions.create({
            model: visionLLM,
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'just print margin number and answers as it is for valuvation so no formatting is required and no explanation and donot add any extra text.also donot create custom margin number' },
                        {
                            type: 'image_url',
                            image_url: { url: finalImageUrl },
                        },
                    ],
                },
            ],
        });

        console.log('Image processed successfully');
        const textOutput = output?.choices[0]?.message?.content || '';
        console.log('Received text output:', textOutput);

        const jsonResponse = formatAnswersToJson(textOutput);
        console.log('Formatted JSON response:', jsonResponse);

        res.json(jsonResponse);
    } catch (error) {
        console.error('Error processing image:', error);
        res.status(500).json({ error: 'Failed to process image' });
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

export { ocr };
