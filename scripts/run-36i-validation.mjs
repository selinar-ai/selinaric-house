/**
 * Phase 36I — Live post-migration validation.
 *
 * !! THIS SCRIPT IS RETIRED !!
 *
 * The original version hardcoded a production Lounge thread ID as TEST_THREAD_ID
 * and sent test messages to the active production thread via POST /api/lounge-chat.
 * The cleanup SQL it suggested deleted the production thread and all messages.
 *
 * See: Phase 36I recovery analysis (2026-05-26)
 *
 * Lessons:
 * - POST /api/lounge-chat always writes to the active thread (getOrCreateActiveThread)
 * - There is no threadId isolation parameter
 * - lounge_messages had ON DELETE CASCADE from lounge_threads
 * - "All Lounge rows belong to test thread" was true only because there was ONE thread
 *
 * This file is kept as a record. Do not run it.
 */

throw new Error('This validation script is retired. See file header for details.')
