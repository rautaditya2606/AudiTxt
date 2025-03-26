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

app.get("/", (req, res) => {
    res.render("index");
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
            }
        );
        
        if (error) throw error;
        const transcription = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
        if (!transcription) {
            throw new Error("No transcription found in the response");
        }
        res.json({ transcription });
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
                detect_language: true,  // more language :)
            }
        );
        
        if (error) throw error;
        const transcription = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
        
        if (!transcription) {
            throw new Error("No transcription found in the response");
        }
        
        res.json({ 
            transcription,
            language: result?.results?.channels?.[0]?.detected_language  // Include detected language if available
        });
    } catch (error) {
        console.error("Stream transcription error:", error);
        res.status(500).json({
            error: "Error processing audio stream",
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