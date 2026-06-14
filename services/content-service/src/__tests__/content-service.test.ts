/** content-service tests (§10.4, §18). */

import { InMemoryEventBus } from '@litplay/server-kit';
import { TOPICS } from '@litplay/contracts';
import { ContentService } from '../content-service.js';
import { InMemoryContentRepository, LEXILE_BY_GRADE } from '../repo/content-repo.js';

function makeWorld(overrides?: Partial<{ id: string; title: string; gradeLevel: string }>) {
  return {
    id: overrides?.id ?? crypto.randomUUID(),
    title: overrides?.title ?? 'The Dragon\'s Library',
    gradeLevel: overrides?.gradeLevel ?? '2',
    lexileRange: LEXILE_BY_GRADE['2'],
    language: 'en-US',
    tags: ['adventure'],
    thumbnailUrl: null,
    assetBundleUrl: 'https://cdn.litplay.app/content/test/bundle.zip',
    manifestVersion: '1',
    checksumSha256: 'abc123',
    isPublished: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    scenes: [
      {
        id: crypto.randomUUID(),
        worldId: '',
        title: 'Scene 1',
        sceneIndex: 0,
        estimatedMinutes: 5,
        gates: [
          {
            id: crypto.randomUUID(),
            sceneId: '',
            passage: 'The cat sat on the mat.',
            difficulty: 'Easy' as const,
            maxRetries: 3,
            orderIndex: 0,
          },
        ],
      },
    ],
  };
}

function makeService() {
  const repo = new InMemoryContentRepository();
  const eventBus = new InMemoryEventBus();
  const service = new ContentService({ repo, eventBus });
  return { repo, eventBus, service };
}

describe('ContentService', () => {
  it('lists published worlds', async () => {
    const { repo, service } = makeService();
    await repo.createWorld(makeWorld({ gradeLevel: '2' }) as any);
    await repo.createWorld(makeWorld({ gradeLevel: '3' }) as any);
    const worlds = await service.listWorlds({ published: true });
    expect(worlds).toHaveLength(2);
  });

  it('filters by grade level', async () => {
    const { repo, service } = makeService();
    await repo.createWorld(makeWorld({ gradeLevel: '2' }) as any);
    await repo.createWorld(makeWorld({ gradeLevel: '3' }) as any);
    const grade2 = await service.listWorlds({ gradeLevel: '2' });
    expect(grade2).toHaveLength(1);
    expect(grade2[0].gradeLevel).toBe('2');
  });

  it('gets a world by ID', async () => {
    const { repo, service } = makeService();
    const world = makeWorld() as any;
    await repo.createWorld(world);
    const found = await service.getWorld(world.id);
    expect(found.title).toBe('The Dragon\'s Library');
  });

  it('throws NotFound for missing world', async () => {
    const { service } = makeService();
    await expect(service.getWorld('missing')).rejects.toThrow('World not found');
  });

  it('returns signed download URL (§18.2)', async () => {
    const { repo, service } = makeService();
    const world = makeWorld() as any;
    await repo.createWorld(world);
    const result = await service.getDownloadUrl(world.id);
    expect(result.url).toContain('Expires=');
    expect(result.expiresInSeconds).toBe(86400); // 24h
  });

  it('lists all gates in a world', async () => {
    const { repo, service } = makeService();
    const world = makeWorld() as any;
    await repo.createWorld(world);
    const gates = await service.listGates(world.id);
    expect(gates).toHaveLength(1);
    expect(gates[0].passage).toBe('The cat sat on the mat.');
  });

  it('assigns content and emits event (§15.3)', async () => {
    const { repo, eventBus, service } = makeService();
    const world = makeWorld() as any;
    await repo.createWorld(world);
    const studentId = crypto.randomUUID();
    const teacherId = crypto.randomUUID();

    const assignment = await service.assignContent(
      { contentId: world.id, studentId },
      teacherId,
    );
    expect(assignment.studentId).toBe(studentId);

    const events = eventBus.published.filter(
      (e) => e.topic === TOPICS.CONTENT_ASSIGNMENT_CREATED,
    );
    expect(events).toHaveLength(1);
  });

  it('rejects assignment without studentId or classroomId', async () => {
    const { service } = makeService();
    await expect(
      service.assignContent({ contentId: 'x' }, 'teacher'),
    ).rejects.toThrow('Either studentId or classroomId');
  });
});
