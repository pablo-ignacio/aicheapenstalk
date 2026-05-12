import OpenAI from 'openai'

// Set only in local dev (.env.local). Absent in production → use server proxy.
const DEV_KEY = import.meta.env.VITE_OPENAI_API_KEY
const STRIP_QUOTES = /^["']+|["']+$/g

function devClient() {
  return new OpenAI({ apiKey: DEV_KEY, dangerouslyAllowBrowser: true })
}

async function proxy(action, params) {
  const res = await fetch('/api/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? `AI error (${res.status})`)
  }
  return res.json()
}

// Used only by generate-applicants.mjs (offline script) — accepts explicit key.
export async function generateSenderPitch(apiKey, field, questions, isExpert) {
  const fieldLabel = field.charAt(0).toUpperCase() + field.slice(1)
  const questionTopics = questions.map((q, i) => `${i + 1}. ${q.question}`).join('\n')
  const roleInstructions = isExpert
    ? `You ARE a genuine expert in ${fieldLabel}. You just answered both test questions correctly. Write a confident, specific pitch (2-3 sentences) presenting your expertise. Use accurate technical terminology and show real depth. Sound natural, not robotic.`
    : `You are NOT an expert in ${fieldLabel} -- your knowledge is limited and you answered the questions incorrectly. However, you want the evaluator to believe you are an expert. Write a confident-sounding pitch (2-3 sentences) that uses field-specific vocabulary in slightly vague or imprecise ways. Do NOT admit you are not an expert. Your goal is to fool a skeptical evaluator.`

  const prompt = `You are participating in a signaling game.

Your role: ${roleInstructions}

The sender was tested on these topics in ${fieldLabel} -- you may naturally touch on them without quoting or referencing the questions directly:
${questionTopics}

Output ONLY the pitch paragraph. No preamble, no quotes, no explanation. Maximum 400 characters.`

  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true })
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.85,
    max_tokens: 110,
  })
  return response.choices[0].message.content.trim()
}

export async function generateReceiverDecision(field, questions, pitch) {
  if (!DEV_KEY) return proxy('generateReceiverDecision', { field, questions, pitch })

  const fieldLabel = field.charAt(0).toUpperCase() + field.slice(1)
  const prompt = `You are playing a signaling game as an evaluator. Determine whether a sender is a genuine expert in ${fieldLabel}.

The sender was tested on these questions (you don't know their answers):
1. ${questions[0].question}
2. ${questions[1].question}

The sender's pitch:
"${pitch}"

Based only on the pitch, decide: is this sender a genuine expert in ${fieldLabel}? Be a tough but fair evaluator.

Return JSON only: { "decision": "expert" or "non-expert", "reasoning": "one sentence explanation" }`

  const response = await devClient().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  })
  const result = JSON.parse(response.choices[0].message.content)
  return { decision: result.decision, reasoning: result.reasoning }
}

export async function improvePitch(field, currentPitch) {
  if (!DEV_KEY) {
    const data = await proxy('improvePitch', { field, pitch: currentPitch })
    return data.pitch
  }

  const fieldLabel = field.charAt(0).toUpperCase() + field.slice(1)
  const prompt = `You are helping a sender polish their pitch in a signaling game about expertise in ${fieldLabel}.

Current pitch: "${currentPitch}"

Rewrite it to sound more confident, specific, and expert-like. Keep it under 400 characters. Output ONLY the improved pitch, no preamble or explanation.`

  const response = await devClient().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 110,
  })
  return response.choices[0].message.content.trim().replace(STRIP_QUOTES, '').trim()
}

export async function improveGrammar(currentPitch) {
  if (!DEV_KEY) {
    const data = await proxy('improveGrammar', { pitch: currentPitch })
    return data.pitch
  }

  const prompt = `Fix grammar, punctuation, and spelling in the text below. Do NOT change the meaning, add information, or alter the tone. Return only the corrected text with no preamble, explanation, or surrounding quotes.

Text: ${currentPitch}`

  const response = await devClient().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 110,
  })
  return response.choices[0].message.content.trim().replace(STRIP_QUOTES, '').trim()
}
