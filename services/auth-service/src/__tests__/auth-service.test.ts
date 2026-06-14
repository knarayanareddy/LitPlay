/**
 * Auth-service unit tests (§16, §17 COPPA, §29.2 ≥95% coverage).
 *
 * Tests the domain logic directly via the in-memory repository + in-memory
 * event bus. No HTTP, no database.
 */

import {
  InMemoryEventBus,
  requiresParentalConsent,
} from '@litplay/server-kit';
import { TOPICS } from '@litplay/contracts';
import { AuthService } from '../auth-service.js';
import { InMemoryAuthRepository } from '../repo/auth-repo.js';

function makeService() {
  const repo = new InMemoryAuthRepository();
  const eventBus = new InMemoryEventBus();
  const service = new AuthService({ repo, eventBus });
  return { repo, eventBus, service };
}

function childDob(ageYears: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - ageYears);
  return d.toISOString().slice(0, 10);
}

// --- Registration & COPPA ---------------------------------------------------

describe('AuthService.register', () => {
  it('registers an adult/parent without consent', async () => {
    const { service, eventBus } = makeService();
    const { user, requiresConsent } = await service.register({
      email: 'parent@test.com',
      password: 'securePass1!',
      role: 'parent',
    });
    expect(user.role).toBe('parent');
    expect(requiresConsent).toBe(false);

    // §15.3 — should emit user.created
    const events = eventBus.published.filter(
      (e) => e.topic === TOPICS.AUTH_USER_CREATED,
    );
    expect(events).toHaveLength(1);
    expect(events[0].data).toMatchObject({
      email: 'parent@test.com',
      requiresParentalConsent: false,
    });
  });

  it('flags an 8-year-old student as requiring parental consent', async () => {
    const { service, repo } = makeService();
    const { user, requiresConsent } = await service.register({
      email: 'child@test.com',
      password: 'securePass1!',
      role: 'student',
      dateOfBirth: childDob(8),
    });
    expect(requiresConsent).toBe(true);
    expect(user.requiresParentalConsent).toBe(true);

    // §17.1 — pending consent record should exist
    const consent = await repo.findConsentByChild(user.id);
    expect(consent).not.toBeNull();
    expect(consent!.status).toBe('pending');
  });

  it('does NOT flag a 14-year-old student', async () => {
    const { service } = makeService();
    const { requiresConsent } = await service.register({
      email: 'teen@test.com',
      password: 'securePass1!',
      role: 'student',
      dateOfBirth: childDob(14),
    });
    expect(requiresConsent).toBe(false);
  });

  it('rejects duplicate email', async () => {
    const { service } = makeService();
    await service.register({
      email: 'dup@test.com',
      password: 'securePass1!',
      role: 'parent',
    });
    await expect(
      service.register({
        email: 'dup@test.com',
        password: 'securePass1!',
        role: 'parent',
      }),
    ).rejects.toThrow('Email already registered');
  });
});

// --- Login & consent gating -------------------------------------------------

describe('AuthService.login', () => {
  it('logs in a registered parent', async () => {
    const { service } = makeService();
    await service.register({
      email: 'parent@test.com',
      password: 'securePass1!',
      role: 'parent',
    });
    const { tokens, user } = await service.login('parent@test.com', 'securePass1!');
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
    expect(tokens.expiresIn).toBe(900);
    expect(user.email).toBe('parent@test.com');
  });

  it('rejects wrong password', async () => {
    const { service } = makeService();
    await service.register({
      email: 'parent@test.com',
      password: 'securePass1!',
      role: 'parent',
    });
    await expect(
      service.login('parent@test.com', 'wrongpassword'),
    ).rejects.toThrow('Invalid email or password');
  });

  it('blocks login for a child without verified consent (§17.1)', async () => {
    const { service } = makeService();
    await service.register({
      email: 'child@test.com',
      password: 'securePass1!',
      role: 'student',
      dateOfBirth: childDob(8),
    });
    await expect(
      service.login('child@test.com', 'securePass1!'),
    ).rejects.toThrow('Waiting for parental consent');
  });

  it('allows login for a child AFTER consent is verified', async () => {
    const { service, repo } = makeService();
    const { user } = await service.register({
      email: 'child@test.com',
      password: 'securePass1!',
      role: 'student',
      dateOfBirth: childDob(8),
    });

    // Simulate parent verifying consent (now requires parent auth context)
    const parentId = crypto.randomUUID();
    await service.submitConsent(
      {
        childId: user.id,
        parentId,
        consentMethod: 'email',
      },
      parentId,
      'parent',
    );

    const { tokens } = await service.login('child@test.com', 'securePass1!');
    expect(tokens.accessToken).toBeTruthy();

    const consent = await repo.findConsentByChild(user.id);
    expect(consent!.status).toBe('verified');
  });
});

// --- Refresh token rotation & reuse detection (§16.3) ----------------------

describe('AuthService.refresh', () => {
  it('rotates the refresh token on use (single-use)', async () => {
    const { service } = makeService();
    await service.register({
      email: 'parent@test.com',
      password: 'securePass1!',
      role: 'parent',
    });
    const { tokens } = await service.login('parent@test.com', 'securePass1!');

    const newTokens = await service.refresh(tokens.refreshToken);
    expect(newTokens.accessToken).toBeTruthy();
    expect(newTokens.refreshToken).not.toBe(tokens.refreshToken);

    // Old token should now be rejected
    await expect(service.refresh(tokens.refreshToken)).rejects.toThrow(
      'token family revoked',
    );
  });

  it('revokes the entire family on token reuse (§16.3 rule 5)', async () => {
    const { service } = makeService();
    await service.register({
      email: 'parent@test.com',
      password: 'securePass1!',
      role: 'parent',
    });
    const { tokens } = await service.login('parent@test.com', 'securePass1!');

    // Rotate once
    const rotated = await service.refresh(tokens.refreshToken);

    // Now try to reuse the ORIGINAL token again — this is a reuse attack
    await expect(service.refresh(tokens.refreshToken)).rejects.toThrow();

    // The rotated token should now also be revoked (family nuked)
    await expect(service.refresh(rotated.refreshToken)).rejects.toThrow();
  });
});

// --- Account deletion (§17.3) ----------------------------------------------

describe('AuthService.deleteAccount', () => {
  it('soft-deletes the user and emits deletion event', async () => {
    const { service, repo, eventBus } = makeService();
    const { user } = await service.register({
      email: 'parent@test.com',
      password: 'securePass1!',
      role: 'parent',
    });
    await service.deleteAccount(user.id);

    const deleted = await repo.findUserById(user.id);
    expect(deleted!.deletedAt).not.toBeNull();

    const events = eventBus.published.filter(
      (e) => e.topic === TOPICS.AUTH_USER_DELETED,
    );
    expect(events).toHaveLength(1);
  });
});

// --- COPPA consent security ------------------------------------------------

describe('AuthService.submitConsent (secured)', () => {
  it('rejects consent from a student (§17.1)', async () => {
    const { service } = makeService();
    const { user: child } = await service.register({
      email: 'child@test.com', password: 'securePass1!', role: 'student', dateOfBirth: childDob(8),
    });
    const { user: student } = await service.register({
      email: 'student@test.com', password: 'securePass1!', role: 'student', dateOfBirth: childDob(15),
    });
    await expect(
      service.submitConsent(
        { childId: child.id, parentId: student.id, consentMethod: 'email' },
        student.id, 'student',
      ),
    ).rejects.toThrow('Only parents can provide');
  });

  it('accepts consent from a parent', async () => {
    const { service } = makeService();
    const { user: parent } = await service.register({
      email: 'parent@test.com', password: 'securePass1!', role: 'parent',
    });
    const { user: child } = await service.register({
      email: 'child@test.com', password: 'securePass1!', role: 'student',
      dateOfBirth: childDob(8), parentId: parent.id,
    });
    const consent = await service.submitConsent(
      { childId: child.id, parentId: parent.id, consentMethod: 'email' },
      parent.id, 'parent',
    );
    expect(consent.status).toBe('verified');
  });

  it('rejects consent for a child that does not require it', async () => {
    const { service } = makeService();
    const { user: parent } = await service.register({
      email: 'parent@test.com', password: 'securePass1!', role: 'parent',
    });
    const { user: teen } = await service.register({
      email: 'teen@test.com', password: 'securePass1!', role: 'student',
      dateOfBirth: childDob(15),
    });
    await expect(
      service.submitConsent(
        { childId: teen.id, parentId: parent.id, consentMethod: 'email' },
        parent.id, 'parent',
      ),
    ).rejects.toThrow('does not require parental consent');
  });
});

// --- Profile updates (§11.2 PATCH /auth/me) --------------------------------

describe('AuthService.updateProfile', () => {
  it('updates display name and locale', async () => {
    const { service } = makeService();
    const { user } = await service.register({
      email: 'parent@test.com', password: 'securePass1!', role: 'parent',
    });
    const updated = await service.updateProfile(user.id, {
      displayName: 'New Name', locale: 'es-US',
    });
    expect(updated.displayName).toBe('New Name');
    expect(updated.locale).toBe('es-US');
  });

  it('throws NotFound for missing user', async () => {
    const { service } = makeService();
    await expect(
      service.updateProfile('missing-id', { displayName: 'X' }),
    ).rejects.toThrow('User not found');
  });
});

// --- Password reset (§11.2) ------------------------------------------------

describe('AuthService.requestPasswordReset / confirmPasswordReset', () => {
  it('requests and confirms a password reset', async () => {
    const { service } = makeService();
    await service.register({
      email: 'parent@test.com', password: 'securePass1!', role: 'parent',
    });

    const { resetToken } = await service.requestPasswordReset('parent@test.com');
    expect(resetToken).toBeTruthy();

    await service.confirmPasswordReset(resetToken, 'newPassword123!');

    // Old password should no longer work
    await expect(
      service.login('parent@test.com', 'securePass1!'),
    ).rejects.toThrow('Invalid email or password');

    // New password should work
    const { tokens } = await service.login('parent@test.com', 'newPassword123!');
    expect(tokens.accessToken).toBeTruthy();
  });

  it('does not reveal whether email exists', async () => {
    const { service } = makeService();
    const result = await service.requestPasswordReset('nonexistent@test.com');
    expect(result.resetToken).toBe('');
  });

  it('rejects invalid reset token', async () => {
    const { service } = makeService();
    await expect(
      service.confirmPasswordReset('bad-token', 'newPassword123!'),
    ).rejects.toThrow('invalid or expired');
  });

  it('revokes all tokens after password reset', async () => {
    const { service } = makeService();
    await service.register({
      email: 'parent@test.com', password: 'securePass1!', role: 'parent',
    });
    const { tokens: oldTokens } = await service.login('parent@test.com', 'securePass1!');
    const { resetToken } = await service.requestPasswordReset('parent@test.com');

    await service.confirmPasswordReset(resetToken, 'newPassword123!');

    // Old refresh token should now be revoked
    await expect(service.refresh(oldTokens.refreshToken)).rejects.toThrow();
  });
});

// --- COPPA helper -----------------------------------------------------------

describe('requiresParentalConsent', () => {
  it('returns false for non-students', () => {
    expect(requiresParentalConsent('parent', childDob(8))).toBe(false);
  });
  it('returns false without a DOB', () => {
    expect(requiresParentalConsent('student', undefined)).toBe(false);
  });
  it('returns true for under-13 students', () => {
    expect(requiresParentalConsent('student', childDob(7))).toBe(true);
  });
  it('returns false for 13+ students', () => {
    expect(requiresParentalConsent('student', childDob(13))).toBe(false);
  });
});
