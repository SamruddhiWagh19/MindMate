
import { supabase } from './supabase'

function check(result) {
  if (result.error) throw result.error
  return result.data
}

// Organise database records into the MindMate Library structure
function normalizeSet(set, notes, resources, flashcards, files) {
  return {
    id: set.id,
    name: set.name,
    description: set.description || '',
    notes: notes.find(item => item.study_set_id === set.id)?.content || '',

    files: files
      .filter(item => item.study_set_id === set.id)
      .map(item => ({
        id: item.id,
        name: item.name,
        type: item.type || 'Unknown',
        size: Number(item.size || 0),
        storagePath: item.storage_path,
      })),

    resources: resources
      .filter(item => item.study_set_id === set.id)
      .map(item => ({
        id: item.id,
        name: item.title,
        url: item.url,
      })),

    flashcards: flashcards
      .filter(item => item.study_set_id === set.id)
      .map(item => ({
        id: item.id,
        question: item.question,
        answer: item.answer,
      })),
  }
}

// LOAD LIBRARY
export async function loadLibrary(userId) {
  const tables = [
    'subjects',
    'chapters',
    'study_sets',
    'study_set_notes',
    'study_set_resources',
    'flashcards',
    'study_set_files',
  ]

  const results = await Promise.all(
    tables.map(table =>
      supabase
        .from(table)
        .select('*')
        .eq('user_id', userId)
    )
  )

  const [
    subjects,
    chapters,
    sets,
    notes,
    resources,
    flashcards,
    files,
  ] = results.map(check)

  return subjects.map(subject => ({
    id: subject.id,
    name: subject.name,
    description: subject.description || '',

    chapters: chapters
      .filter(chapter => chapter.subject_id === subject.id)
      .map(chapter => ({
        id: chapter.id,
        name: chapter.name,
        description: chapter.description || '',

        sets: sets
          .filter(set => set.chapter_id === chapter.id)
          .map(set =>
            normalizeSet(set, notes, resources, flashcards, files)
          ),
      })),
  }))
}

// CREATE SUBJECT
export async function createSubject(userId, name) {
  return check(
    await supabase
      .from('subjects')
      .insert({
        user_id: userId,
        name,
      })
      .select()
      .single()
  )
}

// CREATE CHAPTER
export async function createChapter(userId, subjectId, name) {
  return check(
    await supabase
      .from('chapters')
      .insert({
        user_id: userId,
        subject_id: subjectId,
        name,
      })
      .select()
      .single()
  )
}

// CREATE STUDY SET
export async function createStudySet(
  userId,
  chapterId,
  name,
  description
) {
  return check(
    await supabase
      .from('study_sets')
      .insert({
        user_id: userId,
        chapter_id: chapterId,
        name,
        description,
      })
      .select()
      .single()
  )
}

// DELETE A BASIC LIBRARY ITEM
export async function deleteLibraryItem(table, id, userId) {
  check(
    await supabase
      .from(table)
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
  )
}

// SAVE STUDY NOTES
export async function saveStudyNotes(userId, studySetId, content) {
  const existing = check(
    await supabase
      .from('study_set_notes')
      .select('id')
      .eq('user_id', userId)
      .eq('study_set_id', studySetId)
      .limit(1)
  )

  if (existing.length) {
    check(
      await supabase
        .from('study_set_notes')
        .update({ content })
        .eq('id', existing[0].id)
        .eq('user_id', userId)
    )
  } else {
    check(
      await supabase
        .from('study_set_notes')
        .insert({
          user_id: userId,
          study_set_id: studySetId,
          content,
        })
    )
  }
}

// ADD RESOURCE
export async function addStudyResource(
  userId,
  studySetId,
  name,
  url
) {
  return check(
    await supabase
      .from('study_set_resources')
      .insert({
        user_id: userId,
        study_set_id: studySetId,
        title: name,
        url,
      })
      .select()
      .single()
  )
}

// DELETE RESOURCE
export async function deleteStudyResource(userId, resourceId) {
  check(
    await supabase
      .from('study_set_resources')
      .delete()
      .eq('id', resourceId)
      .eq('user_id', userId)
  )
}

// ADD FLASHCARD
export async function addStudyFlashcard(
  userId,
  studySetId,
  question,
  answer
) {
  return check(
    await supabase
      .from('flashcards')
      .insert({
        user_id: userId,
        study_set_id: studySetId,
        question,
        answer,
      })
      .select()
      .single()
  )
}

// DELETE FLASHCARD
export async function deleteStudyFlashcard(userId, cardId) {
  check(
    await supabase
      .from('flashcards')
      .delete()
      .eq('id', cardId)
      .eq('user_id', userId)
  )
}

// UPLOAD FILE TO PRIVATE STORAGE
export async function uploadStudyFile(userId, studySetId, file) {
  const fileId = crypto.randomUUID()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')

  const storagePath =
    `${userId}/${studySetId}/${fileId}-${safeName}`

  check(
    await supabase.storage
      .from('study-materials')
      .upload(storagePath, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })
  )

  try {
    return check(
      await supabase
        .from('study_set_files')
        .insert({
          id: fileId,
          user_id: userId,
          study_set_id: studySetId,
          storage_path: storagePath,
          name: file.name,
          type: file.type || '',
          size: file.size,
        })
        .select()
        .single()
    )
  } catch (error) {
    await supabase.storage
      .from('study-materials')
      .remove([storagePath])

    throw error
  }
}

// OPEN FILE USING A TEMPORARY SIGNED URL
export async function openStudyFile(storagePath) {
  const result = await supabase.storage
    .from('study-materials')
    .createSignedUrl(storagePath, 60)

  check(result)

  return result.data.signedUrl
}

// DELETE UPLOADED FILE
export async function deleteStudyFile(userId, file) {
  check(
    await supabase
      .from('study_set_files')
      .delete()
      .eq('id', file.id)
      .eq('user_id', userId)
  )

  check(
    await supabase.storage
      .from('study-materials')
      .remove([file.storagePath])
  )
}

// DELETE COMPLETE STUDY SET
export async function deleteStudySetCloud(userId, studySet) {
  const setId = studySet.id

  const files = check(
    await supabase
      .from('study_set_files')
      .select('id, storage_path')
      .eq('user_id', userId)
      .eq('study_set_id', setId)
  )

  if (files.length > 0) {
    const paths = files.map(file => file.storage_path)

    check(
      await supabase.storage
        .from('study-materials')
        .remove(paths)
    )

    check(
      await supabase
        .from('study_set_files')
        .delete()
        .eq('user_id', userId)
        .eq('study_set_id', setId)
    )
  }

  const childTables = [
    'study_set_notes',
    'study_set_resources',
    'flashcards',
  ]

  for (const table of childTables) {
    check(
      await supabase
        .from(table)
        .delete()
        .eq('user_id', userId)
        .eq('study_set_id', setId)
    )
  }

  check(
    await supabase
      .from('study_sets')
      .delete()
      .eq('id', setId)
      .eq('user_id', userId)
  )
}

// DELETE COMPLETE CHAPTER
export async function deleteChapterCloud(userId, chapter) {
  const sets = check(
    await supabase
      .from('study_sets')
      .select('id')
      .eq('user_id', userId)
      .eq('chapter_id', chapter.id)
  )

  for (const set of sets) {
    await deleteStudySetCloud(userId, set)
  }

  check(
    await supabase
      .from('chapters')
      .delete()
      .eq('id', chapter.id)
      .eq('user_id', userId)
  )
}

// DELETE COMPLETE SUBJECT
export async function deleteSubjectCloud(userId, subject) {
  const chapters = check(
    await supabase
      .from('chapters')
      .select('id')
      .eq('user_id', userId)
      .eq('subject_id', subject.id)
  )

  for (const chapter of chapters) {
    await deleteChapterCloud(userId, chapter)
  }

  check(
    await supabase
      .from('subjects')
      .delete()
      .eq('id', subject.id)
      .eq('user_id', userId)
  )
}
