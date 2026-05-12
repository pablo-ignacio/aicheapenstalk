import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const STRIP_QUOTES = /^["']+|["']+$/g

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Server not configured' })
  }

  const { action, field, questions, pitch } = req.body ?? {}
  if (!action) return res.status(400).json({ error: 'Missing action' })

  const fieldLabel = field ? field.charAt(0).toUpperCase() + field.slice(1) : ''

  try {
    if (action === 'generateReceiverDecision') {
      const prompt = `You are playing a signaling game as an evaluator. Determine whether a sender is a genuine expert in ${fieldLabel}.

The sender was tested on these questions (you don't know their answers):
1. ${questions[0].question}
2. ${questions[1].question}

The sender's pitch:
"${pitch}"

Based only on the pitch, decide: is this sender a genuine expert in ${fieldLabel}? Be a tough but fair evaluator.

Return JSON only: { "decision": "expert" or "non-expert", "reasoning": "one sentence explanation" }`

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      })
      const result = JSON.parse(response.choices[0].message.content)
      return res.status(200).json({ decision: result.decision, reasoning: result.reasoning })
    }

    if (action === 'improvePitch') {
      const prompt = `You are helping a sender polish their pitch in a signaling game about expertise in ${fieldLabel}.

Current pitch: "${pitch}"

Rewrite it to sound more confident, specific, and expert-like. Keep it under 400 characters. Output ONLY the improved pitch, no preamble or explanation.`

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 110,
      })
      const text = response.choices[0].message.content.trim().replace(STRIP_QUOTES, '').trim()
      return res.status(200).json({ pitch: text })
    }

    if (action === 'improveGrammar') {
      const prompt = `Fix grammar, punctuation, and spelling in the text below. Do NOT change the meaning, add information, or alter the tone. Return only the corrected text with no preamble, explanation, or surrounding quotes.

Text: ${pitch}`

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 110,
      })
      const text = response.choices[0].message.content.trim().replace(STRIP_QUOTES, '').trim()
      return res.status(200).json({ pitch: text })
    }

    return res.status(400).json({ error: 'Unknown action' })
  } catch (e) {
    console.error('OpenAI proxy error:', e.message)
    return res.status(500).json({ error: 'AI service unavailable' })
  }
}
