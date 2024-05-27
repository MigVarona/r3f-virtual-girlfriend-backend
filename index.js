import { exec } from "child_process";
import cors from "cors";
import dotenv from "dotenv";
import voice from "elevenlabs-node";
import express from "express";
import { promises as fs } from "fs";
import OpenAI from "openai";
import path from "path";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "-",
});

const elevenLabsApiKey = process.env.ELEVEN_LABS_API_KEY;
const voiceID = "XrExE9yKIg1WjnnlVkGX";

const app = express();
app.use(express.json());

const corsOptions = {
  origin: ['https://r3f-virtual-girlfriend-frontend-sigma.vercel.app', 'http://localhost:5173'],
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

const port = 3000;

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/voices", async (req, res) => {
  res.send(await voice.getVoices(elevenLabsApiKey));
});

const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing command: ${stderr}`);
        return reject(error);
      }
      console.log(`Command executed successfully: ${stdout}`);
      resolve(stdout);
    });
  });
};

const ensureDirectoryExists = async (dir) => {
  try {
    await fs.access(dir);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await fs.mkdir(dir, { recursive: true });
    } else {
      throw error;
    }
  }
};

const lipSyncMessage = async (message) => {
  const time = new Date().getTime();
  const inputFilePath = `audios/message_${message}.mp3`;
  const outputFilePath = `audios/message_${message}.wav`;
  const jsonFilePath = `audios/message_${message}.json`;
  const rhubarbPath = "./bin/rhubarb";
  try {
    await fs.access(inputFilePath);

    console.log(`Starting conversion for message ${message}`);
    await execCommand(`ffmpeg -y -i "${inputFilePath}" "${outputFilePath}"`);
    console.log(`Conversion done in ${new Date().getTime() - time}ms`);

    console.log(`Starting lip sync for message ${message}`);
    await execCommand(`"${rhubarbPath}" -f json -o "${jsonFilePath}" "${outputFilePath}" -r phonetic`);
    console.log(`Lip sync done in ${new Date().getTime() - time}ms`);
  } catch (error) {
    console.error(`Error in lip sync for message ${message}:`, error);
    throw error;
  }
};

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;
  if (!userMessage) {
    res.send({
      messages: [
        {
          text: "Hey dear... How was your day?",
          audio: await audioFileToBase64("audios/intro_0.wav"),
          lipsync: await readJsonTranscript("audios/intro_0.json"),
          facialExpression: "smile",
          animation: "Talking_1",
        },
        {
          text: "I missed you so much... Please don't go for so long!",
          audio: await audioFileToBase64("audios/intro_1.wav"),
          lipsync: await readJsonTranscript("audios/intro_1.json"),
          facialExpression: "sad",
          animation: "Crying",
        },
      ],
    });
    return;
  }
  if (!elevenLabsApiKey || openai.apiKey === "-") {
    res.send({
      messages: [
        {
          text: "Please my dear, don't forget to add your API keys!",
          audio: await audioFileToBase64("audios/api_0.wav"),
          lipsync: await readJsonTranscript("audios/api_0.json"),
          facialExpression: "angry",
          animation: "Angry",
        },
        {
          text: "You don't want to ruin Wawa Sensei with a crazy ChatGPT and ElevenLabs bill, right?",
          audio: await audioFileToBase64("audios/api_1.wav"),
          lipsync: await readJsonTranscript("audios/api_1.json"),
          facialExpression: "smile",
          animation: "Laughing",
        },
      ],
    });
    return;
  }

  const employmentKeywords = ["trabajo", "empleo", "contrato", "entrevista", "currículum", "salario", "vacante", "puestos", "agencia"];
  const isEmploymentRelated = employmentKeywords.some((keyword) =>
    userMessage.toLowerCase().includes(keyword)
  );

  if (!isEmploymentRelated) {
    const audioText = "Lo siento, solo puedo responder preguntas relacionadas con el empleo.";
    const audioFileName = "audios/message_non_employment_message.mp3";

    // Ensure the audios directory exists
    await ensureDirectoryExists(path.dirname(audioFileName));

    // Generate the audio file using ElevenLabs
    await voice.textToSpeech(elevenLabsApiKey, voiceID, audioFileName, audioText);
    
    // Generate lipsync data for the audio file
    await lipSyncMessage("non_employment_message");

    res.send({
      messages: [
        {
          text: audioText,
          audio: await audioFileToBase64(audioFileName),
          lipsync: await readJsonTranscript("audios/message_non_employment_message.json"),
          facialExpression: "sad",
          animation: "Idle",
        },
      ],
    });
    return;
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo-1106",
    max_tokens: 1000,
    temperature: 0.6,
    response_format: {
      type: "json_object",
    },
    messages: [
      {
        role: "system",
        content: `
        Eres un bot de la agencia de empleo de Madrid, y siempre responderás a temas relacionados con el empleo en español.
        Siempre responderás con un arreglo JSON de mensajes. Con un máximo de 3 mensajes.
        Cada mensaje tiene una propiedad de texto, facialExpression y animation.
        Las diferentes expresiones faciales son: smile, sad, angry, surprised, funnyFace, y default.
        Las diferentes animaciones son: Talking_0, Talking_1, Talking_2, Crying, Laughing, Rumba, Idle, Terrified, y Angry.
        `,
      },
      {
        role: "user",
        content: userMessage,
      },
    ],
  });
  let messages = JSON.parse(completion.choices[0].message.content);
  if (messages.messages) {
    messages = messages.messages; 
  }
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const fileName = `audios/message_${i}.mp3`; 
    const textInput = message.text; 
    await voice.textToSpeech(elevenLabsApiKey, voiceID, fileName, textInput);
    await lipSyncMessage(i);
    message.audio = await audioFileToBase64(fileName);
    message.lipsync = await readJsonTranscript(`audios/message_${i}.json`);
  }

  res.send({ messages });
});

const readJsonTranscript = async (file) => {
  const data = await fs.readFile(file, "utf8");
  return JSON.parse(data);
};

const audioFileToBase64 = async (file) => {
  const data = await fs.readFile(file);
  return data.toString("base64");
};

app.listen(port, () => {
  console.log(`Virtual Girlfriend listening on port ${port}`);
});
