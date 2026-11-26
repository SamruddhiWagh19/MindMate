import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function getPublishableKey() {
  const legacy = Deno.env.get('SUPABASE_ANON_KEY')
  if (legacy) return legacy

  const keys = JSON.parse(
    Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}'
  )

  return keys.default || Object.values(keys)[0] || ''
}

function cleanJson(text: string) {
  return text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
}

function normaliseType(value: string, allowed: string[]) {
  return allowed.includes(value) ? value : allowed[0]
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405)
  }

  try {
    const authorization = request.headers.get('Authorization')

    if (!authorization?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Please sign in again.' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = getPublishableKey()

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase function environment is incomplete.')
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authorization } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    const { data: authData, error: authError } =
      await supabase.auth.getUser()

    if (authError || !authData.user) {
      return jsonResponse({
        error: 'Your session could not be verified. Please sign in again.',
      }, 401)
    }

    const userId = authData.user.id
    const body = await request.json()

    const studySetId = body.studySetId
      ? String(body.studySetId)
      : null

    const pastedText = String(body.pastedText || '')
      .trim()
      .slice(0, 40000)

    const questionCount = Math.min(
      20,
      Math.max(5, Number(body.questionCount) || 10)
    )

    const difficulty = ['easy', 'medium', 'hard'].includes(body.difficulty)
      ? body.difficulty
      : 'medium'

    const allowedTypes = ['mcq', 'true_false', 'short']

    const questionTypes = Array.isArray(body.questionTypes)
      ? body.questionTypes.filter((type: string) =>
          allowedTypes.includes(type)
        )
      : ['mcq', 'true_false']

    if (!questionTypes.length) {
      return jsonResponse({
        error: 'Choose at least one question type.',
      }, 400)
    }

    let sourceTitle = 'Pasted study material'
    const textParts: string[] = []

    const fileIds = Array.isArray(body.fileIds)
      ? body.fileIds.slice(0, 3).map(String)
      : []

    // Fetch the selected study set
    if (studySetId) {
      const { data: studySet, error: setError } = await supabase
        .from('study_sets')
        .select('id, name, description')
        .eq('id', studySetId)
        .eq('user_id', userId)
        .single()

      if (setError || !studySet) {
        return jsonResponse({
          error: 'That study set could not be found in your account.',
        }, 404)
      }

      sourceTitle = studySet.name

      if (studySet.description) {
        textParts.push(
          `Study set description: ${studySet.description}`
        )
      }

      // Include saved notes
      if (body.includeNotes !== false) {
        const { data: note, error: noteError } = await supabase
          .from('study_set_notes')
          .select('content')
          .eq('user_id', userId)
          .eq('study_set_id', studySetId)
          .maybeSingle()

        if (noteError) throw noteError

        if (note?.content?.trim()) {
          textParts.push(`STUDY NOTES:\n${note.content}`)
        }
      }

      // Include flashcards
      if (body.includeFlashcards !== false) {
        const { data: cards, error: cardsError } = await supabase
          .from('flashcards')
          .select('question, answer')
          .eq('user_id', userId)
          .eq('study_set_id', studySetId)

        if (cardsError) throw cardsError

        if (cards?.length) {
          textParts.push(
            `FLASHCARDS:\n${cards.map(
              (card, index) =>
                `${index + 1}. Q: ${card.question}\nA: ${card.answer}`
            ).join('\n')}`
          )
        }
      }

      // Include uploaded text files
      if (fileIds.length) {
        const { data: files, error: filesError } = await supabase
          .from('study_set_files')
          .select('id, name, type, size, storage_path')
          .eq('user_id', userId)
          .eq('study_set_id', studySetId)
          .in('id', fileIds)

        if (filesError) throw filesError

        if ((files || []).length !== fileIds.length) {
          return jsonResponse({
            error: 'One or more selected files are unavailable.',
          }, 400)
        }

        for (const file of files || []) {
          if (Number(file.size || 0) > 8 * 1024 * 1024) {
            return jsonResponse({
              error: `${file.name} is larger than the 8 MB limit.`,
            }, 400)
          }

          const { data: blob, error: downloadError } =
            await supabase.storage
              .from('study-materials')
              .download(file.storage_path)

          if (downloadError || !blob) {
            throw new Error(`Could not read ${file.name}.`)
          }

          const mime = String(file.type || blob.type || '')
            .toLowerCase()

          if (mime === 'application/pdf' || /\.pdf$/i.test(file.name)) {
            return jsonResponse({
              error: 'PDF files are not supported by this Groq version yet. You can paste the PDF text into the study material box instead.',
            }, 400)
          }

          if (
            mime.startsWith('text/') ||
            /\.(txt|md|csv)$/i.test(file.name)
          ) {
            textParts.push(
              `FILE: ${file.name}\n${(await blob.text()).slice(0, 25000)}`
            )
          } else {
            return jsonResponse({
              error: `${file.name} is not supported. Use TXT, MD, or CSV files.`,
            }, 400)
          }
        }
      }
    }

    // Include manually pasted material
    if (pastedText) {
      textParts.push(`ADDITIONAL MATERIAL:\n${pastedText}`)
    }

    const sourceText = textParts.join('\n\n').slice(0, 65000)

    if (!sourceText.trim()) {
      return jsonResponse({
        error: 'No study material found. Add notes, flashcards, a text file, or paste material.',
      }, 400)
    }

    // Groq API configuration
    const apiKey = Deno.env.get('GROQ_API_KEY')

    if (!apiKey) {
      return jsonResponse({
        error: 'The Groq API key has not been added to Supabase Edge Function Secrets.',
      }, 503)
    }

    const model =
      Deno.env.get('GROQ_MODEL') || 'openai/gpt-oss-120b'

    const typeDescriptions: Record<string, string> = {
      mcq: 'mcq: create exactly four distinct answer options and set correctAnswer to the exact text of the correct option.',
      true_false: 'true_false: options must be exactly ["True", "False"] and correctAnswer must be exactly "True" or "False".',
      short: 'short: provide a concise expected answer in correctAnswer; options must be an empty array.',
    }

    const typeInstructions = questionTypes
      .map((type: string) => typeDescriptions[type])
      .join('\n')

    const prompt = `
You are MindMate, an accurate study-quiz generator.

Create exactly ${questionCount} questions based ONLY on the supplied study material.

Do not add facts from outside the material.
If a detail is unclear, test a clear fact that is present instead.

Source: ${sourceTitle}
Difficulty: ${difficulty}
Allowed question types: ${questionTypes.join(', ')}.

Use a balanced mix of the selected types.
Use only the selected types.

${typeInstructions}

Return ONLY valid JSON with this exact shape:

{
  "title": "short quiz title",
  "description": "one-sentence source description",
  "questions": [
    {
      "question": "question text",
      "type": "mcq",
      "options": ["option 1", "option 2", "option 3", "option 4"],
      "correctAnswer": "exact answer",
      "explanation": "brief explanation grounded in the material"
    }
  ]
}

Rules:
- Exactly ${questionCount} questions.
- No duplicate questions.
- Clear wording.
- Plausible distractors.
- One defensible correct answer for MCQ.
- Do not reveal the answer in the question.
- Explanations should teach why the answer is correct.
- Keep short answers concise and objectively markable.

STUDY MATERIAL:

${sourceText}
`

    // Send the prompt to Groq
    const aiResponse = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: 'Return only valid JSON. Follow the requested schema exactly.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.35,
          max_completion_tokens: 6000,
          response_format: { type: 'json_object' },
        }),
      }
    )

    const aiPayload = await aiResponse.json()

    if (!aiResponse.ok) {
      console.error('Groq API error:', aiPayload)

      return jsonResponse({
        error: aiPayload?.error?.message ||
          'Groq could not generate a quiz. Please try again.',
      }, 502)
    }

    const responseText =
      aiPayload?.choices?.[0]?.message?.content

    if (!responseText) {
      return jsonResponse({
        error: 'Groq returned an empty response. Please try again.',
      }, 502)
    }

    const generated = JSON.parse(cleanJson(responseText))

    if (
      !Array.isArray(generated.questions) ||
      generated.questions.length !== questionCount
    ) {
      throw new Error(
        'The AI did not return the requested number of questions. Please generate again.'
      )
    }

    // Validate and prepare questions
    const questions = generated.questions.map(
      (question: Record<string, unknown>, index: number) => {
        const type = normaliseType(
          String(question.type || ''),
          questionTypes
        )

        let options = Array.isArray(question.options)
          ? question.options.map(String).slice(0, 4)
          : []

        const correctAnswer =
          String(question.correctAnswer || '').trim()

        if (type === 'mcq') {
          if (
            options.length !== 4 ||
            !options.includes(correctAnswer)
          ) {
            throw new Error(
              `Question ${index + 1} needs four options and one matching correct answer. Please generate again.`
            )
          }
        } else if (type === 'true_false') {
          options = ['True', 'False']

          if (!['True', 'False'].includes(correctAnswer)) {
            throw new Error(
              `Question ${index + 1} has an invalid True/False answer. Please generate again.`
            )
          }
        } else {
          options = []

          if (!correctAnswer) {
            throw new Error(
              `Question ${index + 1} is missing its expected answer. Please generate again.`
            )
          }
        }

        const promptText =
          String(question.question || '').trim()

        if (!promptText) {
          throw new Error(
            `Question ${index + 1} is empty. Please generate again.`
          )
        }

        return {
          user_id: userId,
          prompt: promptText,
          question_type: type,
          options,
          correct_answer: correctAnswer,
          explanation: String(question.explanation || '').trim(),
          sort_order: index,
        }
      }
    )

    // Save quiz
    const quizTitle = String(
      body.title ||
      generated.title ||
      `${sourceTitle} — Practice Quiz`
    ).trim().slice(0, 120)

    const quizDescription = String(
      generated.description ||
      `AI-generated from ${sourceTitle}.`
    ).trim().slice(0, 500)

    const { data: quiz, error: quizError } = await supabase
      .from('study_quizzes')
      .insert({
        user_id: userId,
        title: quizTitle,
        description: quizDescription,
        study_set_id: studySetId,
      })
      .select()
      .single()

    if (quizError) throw quizError

    const questionRows = questions.map(
      (question: Record<string, unknown>) => ({
        ...question,
        quiz_id: quiz.id,
      })
    )

    const { error: insertError } = await supabase
      .from('study_quiz_questions')
      .insert(questionRows)

    if (insertError) {
      await supabase
        .from('study_quizzes')
        .delete()
        .eq('id', quiz.id)
        .eq('user_id', userId)

      throw insertError
    }

    return jsonResponse({
      quiz: {
        ...quiz,
        question_count: questions.length,
      },
    })

  } catch (error) {
    console.error('generate-quiz error:', error)

    return jsonResponse({
      error: error instanceof Error
        ? error.message
        : 'Unexpected quiz generation error.',
    }, 500)
  }
})

