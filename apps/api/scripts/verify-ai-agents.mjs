// verify-ai-agents.mjs
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
const { Pool } = pg;

// Try to load .env from apps/api/.env
const envPath = path.resolve(process.cwd(), 'apps/api/.env');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`✅ Loaded .env from ${envPath}`);
} else {
    // Fallback try local .env
    dotenv.config();
}

// Replicate the app's Prisma setup (using Driver Adapter)
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('❌ DATABASE_URL environment variable is missing.');
    process.exit(1);
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });


async function main() {
  console.log('🔍 Connecting to database to verify AI agents...');

  // 1. Get the latest session
  const session = await prisma.aiInterviewSession.findFirst({
    orderBy: { createdAt: 'desc' },
    include: {
      turns: {
        orderBy: { index: 'asc' },
      },
      evaluation: true,
    },
  });

  if (!session) {
    console.error('❌ No AI Interview sessions found in the database.');
    return;
  }

  console.log(`\n✅ Found latest session: ${session.id}`);
  console.log(`   Status: ${session.status}`);
  console.log(`   Role: ${session.roleTitle}`);
  console.log(`   Total Turns: ${session.turns.length}\n`);

  console.log('--- 🕵️‍♂️ AGENT TRACE ---');

  for (const turn of session.turns) {
    const meta = turn.meta || {};
    
    // Header for the turn
    const speakerIcon = turn.speaker === 'ASSISTANT' ? '🤖' : '👤';
    console.log(`\n${speakerIcon} [${turn.kind}] ${turn.speaker}: "${turn.content.substring(0, 60)}..."`);

    // Verify INTERVIEWER AGENT
    if (turn.kind === 'QUESTION' && turn.speaker === 'ASSISTANT') {
      if (meta.agent === 'InterviewerAgent') {
        console.log(`   ✅ Interviewer Agent active`);
        console.log(`      - Generated Difficulty: ${meta.difficulty}`);
        console.log(`      - Expected Topics: ${(meta.expectedTopics || []).length} items`);
      } else if (turn.index === 0) {
        console.log(`   ℹ️  (First question might be pre-generated or from context)`);
      }
    }

    // Verify COORDINATOR / DEPTH PROBE / CLASSIFIER (on User Answers)
    if (turn.kind === 'ANSWER') {
      // Check Depth Probe
      if (meta.depthProbe) {
        const dp = meta.depthProbe;
        console.log(`   ✅ DepthProbe Agent result:`);
        console.log(`      - Score: ${dp.answerDepthScore}/5`);
        console.log(`      - Needs Follow-up: ${dp.needsFollowUp}`);
        if(dp.keyGaps && dp.keyGaps.length > 0) {
           console.log(`      - Gaps found: ${dp.keyGaps.length}`);
        }
      } else {
        console.warn(`   ⚠️  No DepthProbe trace found for this answer.`);
      }

      // Check Classifier
      if (meta.classifier) {
        const cl = meta.classifier;
        console.log(`   ✅ Classifier Agent result:`);
        console.log(`      - Intent: ${cl.intent}`);
        console.log(`      - Quality: ${cl.quality}`);
        console.log(`      - Difficulty Shift: ${cl.recommendedDifficultyShift}`);
      } else {
         console.warn(`   ⚠️  No Classifier trace found for this answer.`);
      }
    }
  }

  console.log('\n--- 📊 EVALUATOR AGENT ---');
  if (session.evaluation) {
    console.log(`✅ Evaluation Report Found!`);
    console.log(`   - Technical Depth: ${session.evaluation.technicalDepthScore}/100`);
    console.log(`   - Problem Solving: ${session.evaluation.problemSolvingScore}/100`);
    console.log(`   - Communication: ${session.evaluation.communicationScore}/100`);
    console.log(`   - Summary: "${session.evaluation.summary.substring(0, 50)}..."`);
  } else {
    if (session.status === 'ENDED') {
      console.error(`❌ Session is ENDED but no evaluation found. Evaluator Agent might have failed.`);
    } else {
      console.log(`ℹ️  Session is ${session.status} (evaluation runs at end).`);
    }
  }
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
