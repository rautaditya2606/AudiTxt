require("dotenv").config();
const express = require("express");
const fileUpload = require("express-fileupload");
const { createClient } = require("@deepgram/sdk");
const app = express();
const port = 8080;
const deepgramClient = createClient(process.env.DEEPGRAM_API_KEY);

app.set("view engine", "ejs");
app.set("views", __dirname + "/views");

app.use(express.json());
app.use(fileUpload());
app.use(express.static("public"));

// Store active connections for real-time transcription
const activeConnections = new Map();

app.get("/", (req, res) => {
    res.render("index");
});

// Get supported languages
app.get("/languages", (req, res) => {
    const languages = [
        { code: "en", name: "English" },
        { code: "es", name: "Spanish" },
        { code: "fr", name: "French" },
        { code: "de", name: "German" },
        { code: "it", name: "Italian" },
        { code: "pt", name: "Portuguese" },
        { code: "ru", name: "Russian" },
        { code: "ja", name: "Japanese" },
        { code: "ko", name: "Korean" },
        { code: "zh", name: "Chinese" },
        { code: "hi", name: "Hindi" },
        { code: "ar", name: "Arabic" },
        { code: "auto", name: "Auto Detect" }
    ];
    res.json({ languages });
});

// Existing file upload endpoint
app.post("/transcribe", async (req, res) => {
    try {
        if (!req.files?.audio) {
            return res.status(400).json({ error: "No audio file uploaded" });
        }
        const audioFile = req.files.audio;
        const fileType = audioFile.mimetype;
        
        if (!fileType.startsWith("audio/") && !fileType.startsWith("video/")) {
            return res.status(400).json({ error: "Only audio/video files allowed" });
        }
        
        const { result, error } = await deepgramClient.listen.prerecorded.transcribeFile(
            audioFile.data,
            {
                mimetype: fileType,
                model: "nova",
                language: "en",
                smart_format: true,
                punctuate: true,
                diarize: true,
                utterances: true,
                paragraphs: true,
                summarize: "v2",
            }
        );
        
        if (error) throw error;
        const transcription = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
        const detectedLanguage = result?.results?.channels?.[0]?.detected_language;
        const summary = result?.results?.channels?.[0]?.alternatives?.[0]?.summaries?.[0]?.summary;
        
        if (!transcription) {
            throw new Error("No transcription found in the response");
        }
        
        res.json({ 
            transcription,
            detectedLanguage,
            summary,
            confidence: result?.results?.channels?.[0]?.alternatives?.[0]?.confidence,
            words: result?.results?.channels?.[0]?.alternatives?.[0]?.words
        });
    } catch (error) {
        console.error("Transcription error:", error);
        res.status(500).json({
            error: "Error processing audio file",
            details: error.message,
        });
    }
});

// Web App API to transcribe microphone audio
app.post("/transcribe-stream", async (req, res) => {
    try {
        if (!req.body.audio) {
            return res.status(400).json({ error: "No audio data received" });
        }
        
        // Extract uploaded data from base64
        const base64Data = req.body.audio.includes(',') 
            ? req.body.audio.split(',')[1] 
            : req.body.audio;
            
        const audioBuffer = Buffer.from(base64Data, 'base64');
        
        const { result, error } = await deepgramClient.listen.prerecorded.transcribeFile(
            audioBuffer,
            {
                mimetype: 'audio/wav',
                model: "nova",
                language: "en",
                smart_format: true,
                punctuate: true,
                diarize: true,
                utterances: true,
                paragraphs: true,
                summarize: "v2",
            }
        );
        
        if (error) throw error;
        const transcription = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
        const detectedLanguage = result?.results?.channels?.[0]?.detected_language;
        const summary = result?.results?.channels?.[0]?.alternatives?.[0]?.summaries?.[0]?.summary;
        
        if (!transcription) {
            throw new Error("No transcription found in the response");
        }
        
        res.json({ 
            transcription,
            detectedLanguage,
            summary,
            confidence: result?.results?.channels?.[0]?.alternatives?.[0]?.confidence,
            words: result?.results?.channels?.[0]?.alternatives?.[0]?.words
        });
    } catch (error) {
        console.error("Stream transcription error:", error);
        res.status(500).json({
            error: "Error processing audio stream",
            details: error.message,
        });
    }
});

// Real-time transcription endpoint
app.post("/transcribe-realtime", async (req, res) => {
    try {
        const { audio } = req.body;
        
        if (!audio) {
            return res.status(400).json({ error: "No audio data received" });
        }
        
        const base64Data = audio.includes(',') ? audio.split(',')[1] : audio;
        const audioBuffer = Buffer.from(base64Data, 'base64');
        
        const { result, error } = await deepgramClient.listen.prerecorded.transcribeFile(
            audioBuffer,
            {
                mimetype: 'audio/wav',
                model: "nova",
                language: "en",
                smart_format: true,
                punctuate: true,
                interim_results: true,
            }
        );
        
        if (error) throw error;
        
        const transcription = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
        const isFinal = result?.results?.channels?.[0]?.alternatives?.[0]?.is_final;
        
        res.json({ 
            transcription: transcription || "",
            isFinal: isFinal || false,
            detectedLanguage: result?.results?.channels?.[0]?.detected_language
        });
    } catch (error) {
        console.error("Real-time transcription error:", error);
        res.status(500).json({
            error: "Error processing real-time audio",
            details: error.message,
        });
    }
});

// Export transcription to different formats
app.post("/export", (req, res) => {
    try {
        const { transcription, format, filename } = req.body;
        
        if (!transcription) {
            return res.status(400).json({ error: "No transcription provided" });
        }
        
        let content, contentType, extension;
        
        switch (format) {
            case 'txt':
                content = transcription;
                contentType = 'text/plain';
                extension = 'txt';
                break;
            case 'json':
                content = JSON.stringify({ transcription, timestamp: new Date().toISOString() }, null, 2);
                contentType = 'application/json';
                extension = 'json';
                break;
            case 'html':
                content = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Transcription</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        .header { border-bottom: 2px solid #007bff; padding-bottom: 10px; margin-bottom: 20px; }
        .timestamp { color: #666; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Audio Transcription</h1>
        <div class="timestamp">Generated on: ${new Date().toLocaleString()}</div>
    </div>
    <div class="content">
        ${transcription.replace(/\n/g, '<br>')}
    </div>
</body>
</html>`;
                contentType = 'text/html';
                extension = 'html';
                break;
            default:
                return res.status(400).json({ error: "Unsupported format" });
        }
        
        const finalFilename = filename ? `${filename}.${extension}` : `transcription.${extension}`;
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${finalFilename}"`);
        res.send(content);
        
    } catch (error) {
        console.error("Export error:", error);
        res.status(500).json({
            error: "Error exporting transcription",
            details: error.message,
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});