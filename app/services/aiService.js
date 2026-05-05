/**
 * aiService.js — FreelancerHub Gemini AI Integration
 * Uses @google/generative-ai (free tier: 60 req/min)
 * Falls back gracefully when GEMINI_API_KEY is not set.
 */

let genAI = null;
let model = null;
const isTestMode = process.env.NODE_ENV === 'test';
const isDemoMode = isTestMode || ['demo', 'test'].includes((process.env.AI_MODE || '').toLowerCase());

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

function extractJson(text) {
  if (!text) return null;
  try {
    // Try to find a JSON block between ```json and ```
    const match = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
    if (match) {
      return JSON.parse(match[1].trim());
    }
    // Try to find the first { or [ and the last } or ]
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(text.substring(firstBrace, lastBrace + 1));
    }
    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      return JSON.parse(text.substring(firstBracket, lastBracket + 1));
    }
    // Last resort: try to parse the whole thing
    return JSON.parse(text.trim());
  } catch (e) {
    console.error('extractJson error:', e.message, 'Raw text:', text);
    return null;
  }
}

/**
 * Summarize a project description into 3 bullet points.
 * Returns { summary, bullets[] } or null on failure.
 */
exports.summarizeProject = async (title, description) => {
  if (isTestMode) {
    return {
      summary: `A project to build ${title} with a clear scope and timeline`,
      bullets: [
        `Define requirements and deliver the ${title}`,
        'Follow the described milestones and deadlines',
        'Maintain communication with the client'
      ],
      difficulty: 'intermediate',
      estimatedDays: 7
    };
  }

  const prompt = `You are a project analyst for a freelance marketplace. 
Analyze the following project and provide a summary.
Respond ONLY with a JSON object in this format:
{
  "summary": "a single sentence summary (max 150 chars)",
  "bullets": ["deliverable 1", "deliverable 2", "deliverable 3"],
  "difficulty": "beginner" | "intermediate" | "expert",
  "estimatedDays": integer
}

Project Title: ${title}
Project Description: ${description}`;

  const raw = await generate(prompt);
  return extractJson(raw);
};

/**
 * Extract required skills from a project description.
 * Returns string[] of skill names.
 */
exports.extractSkills = async (description) => {
  if (isTestMode) {
    const words = description
      .split(/[^A-Za-z0-9\.\+\#\-]+/)
      .filter(Boolean)
      .map(w => w.trim())
      .filter(w => w.length > 2);
    return Array.from(new Set(words)).slice(0, 8);
  }

  const prompt = `Identify the top 8 technical skills or technologies required for this project.
Return ONLY a JSON array of strings, e.g. ["React", "Node.js"].

Project Description: ${description}`;

  const raw = await generate(prompt);
  const parsed = extractJson(raw);
  return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
};

/**
 * Analyse bids and recommend the best freelancer.
 * Returns { recommendedName, reason, riskLevel } or null.
 */
exports.analyseBids = async (projectTitle, projectDescription, bids) => {
  if (!bids || bids.length === 0) return null;
  if (isTestMode) {
    const bestBid = bids[0];
    return {
      recommendedName: bestBid.freelancerName || 'Freelancer',
      reason: 'This bid offers a strong balance of price, timeline, and experience.',
      riskLevel: 'low'
    };
  }

  const bidsText = bids.map((b, i) =>
    `Bid ${i + 1}: ${b.freelancerName} — ₹${b.amount} in ${b.deliveryDays} days, Rating: ${b.freelancerRating || 0}/5\nProposal: ${b.proposal.substring(0, 200)}`
  ).join('\n\n');

  const prompt = `Analyze these bids for the project and recommend the best one.
Return ONLY a JSON object with: "recommendedName", "reason" (max 120 chars), and "riskLevel" ("low", "medium", "high").

Project: ${projectTitle}
Description: ${projectDescription.substring(0, 300)}
Bids: ${bidsText}`;

  const raw = await generate(prompt);
  return extractJson(raw);
};

/**
 * Generate a simple project contract.
 * Returns a plain-text contract string.
 */
exports.generateContract = async (project, bid) => {
  if (isDemoMode) {
    return `FreelancerHub Demo Contract\n\nClient: ${project.clientName}\nFreelancer: ${bid.freelancerName}\nProject: ${project.title}\nAmount: ₹${bid.amount}\nDelivery: ${bid.deliveryDays} days\n\nScope:\n- ${project.description.substring(0, 120)}\n- Deliver the agreed features and milestones\n- Communicate progress with the client\n\nThis contract is a demo placeholder for testing and does not execute payment or legal obligations.`;
  }

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
