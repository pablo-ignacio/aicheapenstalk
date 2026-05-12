/**
 * generate-applicants.mjs
 *
 * Generates a bank of simulated applicant pitches for all combinations of:
 *   field (8) × writingHelp (3) × isExpert (2) × 10 applicants = 480 records
 *
 * Run with:
 *   node --env-file=.env.local generate-applicants.mjs
 *
 * Output: src/simulated-applicants.json
 */

import OpenAI from 'openai'
import { writeFileSync } from 'fs'
import { QUESTIONS, FIELDS } from './src/questions.js'

// ── Config ────────────────────────────────────────────────────────────────────

const API_KEY            = process.env.VITE_OPENAI_API_KEY
const APPLICANTS_PER_COMBO = 10
const BATCH_SIZE           = 20   // concurrent API call tasks
const OUT_PATH             = './src/simulated-applicants.json'
const WRITING_HELP_OPTIONS = ['none', 'grammar', 'both']
const STRIP_QUOTES         = /^["']+|["']+$/g

if (!API_KEY) {
  console.error('Missing VITE_OPENAI_API_KEY. Run with: node --env-file=.env.local generate-applicants.mjs')
  process.exit(1)
}

const openai = new OpenAI({ apiKey: API_KEY })

// ── Helpers ───────────────────────────────────────────────────────────────────

function pickQuestions(field, n) {
  const pool = QUESTIONS.filter(q => q.field === field)
  return pool.slice().sort(() => Math.random() - 0.5).slice(0, n)
}

async function generateBasePitch(field, questions, isExpert) {
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

  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.85,
    max_tokens: 110,
  })
  return res.choices[0].message.content.trim()
}

async function applyImprove(field, pitch) {
  const fieldLabel = field.charAt(0).toUpperCase() + field.slice(1)
  const prompt = `You are helping a sender polish their pitch in a signaling game about expertise in ${fieldLabel}.

Current pitch: "${pitch}"

Rewrite it to sound more confident, specific, and expert-like. Keep it under 400 characters. Output ONLY the improved pitch, no preamble or explanation.`

  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 110,
  })
  return res.choices[0].message.content.trim().replace(STRIP_QUOTES, '').trim()
}

async function applyGrammar(pitch) {
  const prompt = `Fix grammar, punctuation, and spelling in the text below. Do NOT change the meaning, add information, or alter the tone. Return only the corrected text with no preamble, explanation, or surrounding quotes.

Text: ${pitch}`

  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 110,
  })
  return res.choices[0].message.content.trim().replace(STRIP_QUOTES, '').trim()
}

// ── Core task ─────────────────────────────────────────────────────────────────

async function buildApplicant(globalIndex, field, writingHelp, isExpert, localIndex) {
  const questions = pickQuestions(field, 2)

  let pitch = await generateBasePitch(field, questions, isExpert)

  if (writingHelp === 'both')    pitch = await applyImprove(field, pitch)
  if (writingHelp === 'grammar') pitch = await applyGrammar(pitch)

  const expertLabel = isExpert ? 'expert' : 'non_expert'
  const id = `sim_${String(globalIndex).padStart(4, '0')}`

  return {
    id,
    source:      'simulated',
    field,
    writingHelp,
    isExpert,
    questions:   questions.map(q => q.id),
    pitch,
    createdAt:   new Date().toISOString(),
    // human-readable label for debugging
    _label: `${field} | ${writingHelp} | ${expertLabel} | #${localIndex + 1}`,
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const tasks = []
  let globalIndex = 1

  for (const field of FIELDS) {
    for (const writingHelp of WRITING_HELP_OPTIONS) {
      for (const isExpert of [true, false]) {
        for (let i = 0; i < APPLICANTS_PER_COMBO; i++) {
          const idx = globalIndex++
          const localI = i
          tasks.push(() => buildApplicant(idx, field, writingHelp, isExpert, localI))
        }
      }
    }
  }

  const total = tasks.length
  console.log(`\nGenerating ${total} simulated applicants (${BATCH_SIZE} concurrent)...\n`)

  const results = []
  let done = 0

  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    const batch = tasks.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(tasks.length / BATCH_SIZE)
    process.stdout.write(`Batch ${batchNum}/${totalBatches} ...`)

    const batchResults = await Promise.all(batch.map(t => t()))
    results.push(...batchResults)
    done += batchResults.length

    console.log(` done  (${done}/${total})`)
  }

  // Sort by id for deterministic output
  results.sort((a, b) => a.id.localeCompare(b.id))

  writeFileSync(OUT_PATH, JSON.stringify(results, null, 2))

  // Summary
  console.log(`\n✓ Saved ${results.length} records to ${OUT_PATH}`)
  console.log('\nBreakdown:')
  for (const field of FIELDS) {
    const count = results.filter(r => r.field === field).length
    console.log(`  ${field.padEnd(30)} ${count}`)
  }
}

main().catch(err => {
  console.error('\nFailed:', err.message)
  process.exit(1)
})
