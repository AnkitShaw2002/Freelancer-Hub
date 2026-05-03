/**
 * aiService.js — FreelancerHub Gemini AI Integration
 * Uses @google/generative-ai (free tier: 60 req/min)
 * Falls back gracefully when GEMINI_API_KEY is not set.
 */

let genAI = null;
let model = null;

function getModel() {
  if (model) return model;
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
    return model;
  } catch (e) {
    console.error('Gemini init error:', e.message);
    return null;
  }
}

async function generate(prompt) {
  const m = getModel();
  if (!m) return null;
  try {
    const result = await m.generateContent(prompt);
    return result.response.text();
  } catch (e) {
    console.error('Gemini generate error:', e.message);
    return null;
  }
}

/**
 * Summarize a project description into 3 bullet points.
 * Returns { summary, bullets[] } or null on failure.
 */
exports.summarizeProject = async (title, description) => {
  const prompt = `You are a project analyst for a freelance marketplace. 
Given this project, produce EXACTLY a JSON object (no markdown, no code fences) with these keys:
- "summary": a single sentence (max 150 chars) summarizing the project
- "bullets": an array of exactly 3 short strings (each max 80 chars), each a key deliverable
- "difficulty": one of "beginner", "intermediate", or "expert"
- "estimatedDays": an integer estimate of working days to complete this

Project Title: ${title}
Project Description: ${description}

Respond with ONLY valid JSON. No markdown, no backticks.`;

  const raw = await generate(prompt);
  if (!raw) return null;
  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error('Gemini parse error:', e.message, raw);
    return null;
  }
};

/**
 * Extract required skills from a project description.
 * Returns string[] of skill names.
 */
exports.extractSkills = async (description) => {
  const prompt = `Extract the technical skills and technologies required for this project.
Return ONLY a JSON array of skill strings (e.g. ["Node.js","React","MongoDB"]).
Maximum 8 skills. No markdown, no explanation, no code fences.

Project Description: ${description}`;

  const raw = await generate(prompt);
  if (!raw) return [];
  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
  } catch (e) {
    return [];
  }
};

/**
 * Analyse bids and recommend the best freelancer.
 * Returns { recommendedName, reason, riskLevel } or null.
 */
exports.analyseBids = async (projectTitle, projectDescription, bids) => {
  if (!bids || bids.length === 0) return null;

  const bidsText = bids.map((b, i) =>
    `Bid ${i + 1}: ${b.freelancerName} — ₹${b.amount} in ${b.deliveryDays} days, Rating: ${b.freelancerRating || 0}/5\nProposal: ${b.proposal.substring(0, 200)}`
  ).join('\n\n');

  const prompt = `You are a hiring advisor for a freelance marketplace. 
Analyse these bids for the project and recommend the best one.

Project: ${projectTitle}
Description: ${projectDescription.substring(0, 300)}

Bids:
${bidsText}

Respond with ONLY a JSON object (no markdown) with keys:
- "recommendedName": string (freelancer name)
- "reason": string (max 120 chars explaining why)
- "riskLevel": "low", "medium", or "high"`;

  const raw = await generate(prompt);
  if (!raw) return null;
  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    return null;
  }
};

/**
 * Generate a simple project contract.
 * Returns a plain-text contract string.
 */
exports.generateContract = async (project, bid) => {
  const prompt = `Generate a simple, professional freelance contract for this project.
Include: parties, scope of work (3 bullets), payment amount, delivery date estimate, IP ownership, revision policy.
Keep it under 350 words. Plain text only, no markdown.

Project: ${project.title}
Client: ${project.clientName}
Freelancer: ${bid.freelancerName}
Amount: ₹${bid.amount}
Delivery: ${bid.deliveryDays} days
Description: ${project.description.substring(0, 300)}`;

  const raw = await generate(prompt);
  return raw || null;
};
