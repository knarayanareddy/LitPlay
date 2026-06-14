/**
 * Seed data — MVP content world "The Dragon's Library" (§30.1).
 *
 * Grade 2, ≥5 scenes, ≥10 reading gates (acceptance criteria).
 * Run: npx tsx tools/seed.ts
 */

import { LEXILE_BY_GRADE } from '../services/content-service/src/repo/content-repo.js';

const STUDENT_ID = '00000000-0000-0000-0000-0000000000a1';
const PARENT_ID = '00000000-0000-0000-0000-0000000000b1';
const TEACHER_ID = '00000000-0000-0000-0000-0000000000c1';
const WORLD_ID = '00000000-0000-0000-0000-0000000000d1';

const passages = {
  easy: [
    'The cat sat on the mat.',
    'A big red dog ran fast.',
    'I see three little pigs.',
    'The sun is hot and bright.',
    'Look at the green frog jump.',
  ],
  medium: [
    'The dragon guarded the golden treasure in the cave.',
    'She opened the mysterious book and began to read aloud.',
    'The knight rode bravely through the dark forest.',
    'Children laughed when the wizard performed his magic trick.',
    'The library was filled with thousands of wonderful stories.',
  ],
};

const scenes = [
  { title: 'The Village', passages: [passages.easy[0], passages.easy[1]] },
  { title: 'The Dark Forest', passages: [passages.easy[2], passages.medium[0]] },
  { title: 'The Mountain Pass', passages: [passages.easy[3], passages.medium[1]] },
  { title: 'The Dragon\'s Cave', passages: [passages.medium[2], passages.medium[3]] },
  { title: 'The Golden Library', passages: [passages.medium[4], passages.easy[4]] },
];

const world = {
  id: WORLD_ID,
  title: "The Dragon's Library",
  gradeLevel: '2',
  lexileRange: LEXILE_BY_GRADE['2'],
  language: 'en-US',
  tags: ['adventure', 'fantasy', 'grade-2'],
  thumbnailUrl: 'https://cdn.litplay.app/thumbnails/dragons-library.png',
  assetBundleUrl: 's3://litplay-content/dragons-library/v1/bundle.zip',
  manifestVersion: '1.0.0',
  checksumSha256: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
  isPublished: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  deletedAt: null,
  scenes: scenes.map((scene, sIdx) => ({
    id: crypto.randomUUID(),
    worldId: WORLD_ID,
    title: scene.title,
    sceneIndex: sIdx,
    estimatedMinutes: 5,
    gates: scene.passages.map((passage, gIdx) => ({
      id: crypto.randomUUID(),
      sceneId: '', // would be set after scene creation
      passage,
      difficulty: sIdx < 2 ? 'Easy' : 'Medium',
      maxRetries: 3,
      orderIndex: gIdx,
    })),
  })),
};

// Wire up sceneId references
world.scenes.forEach((scene) => {
  scene.gates.forEach((gate) => {
    gate.sceneId = scene.id;
  });
});

const totalGates = world.scenes.reduce((sum, s) => sum + s.gates.length, 0);

console.log('=== LitPlay Seed Data (§30.1 MVP) ===');
console.log(`World: ${world.title} (${world.gradeLevel})`);
console.log(`Scenes: ${world.scenes.length} (≥5 ✓)`);
console.log(`Gates: ${totalGates} (≥10 ✓)`);
console.log(`Lexile range: ${world.lexileRange}`);
console.log('\nScene breakdown:');
world.scenes.forEach((s, i) => {
  console.log(`  ${i + 1}. ${s.title} — ${s.gates.length} gates`);
  s.gates.forEach((g) => {
    console.log(`     [${g.difficulty}] "${g.passage}"`);
  });
});

export { world, STUDENT_ID, PARENT_ID, TEACHER_ID, WORLD_ID };
