import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { makeUserRow, signToken, type UserRow } from './helpers/fixtures';
import { Role } from '../src/shared/constants/roles';

// ---------------------------------------------------------------------------
// Prisma isolation (same strategy as auth.test.ts).
//
// The users module uses more Prisma methods than auth, so the hoisted mock
// exposes findUnique/findFirst/findMany/create/updateMany. They are all backed
// by a single mutable in-memory `users` array so the mock behaves like a tiny
// relational store (tenant filtering, inserts, scoped updates). The real
// `src/lib/prisma` module body therefore never runs and no DB is contacted.
// ---------------------------------------------------------------------------
const { findUnique, findFirst, findMany, create, updateMany } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock('../src/lib/prisma', () => ({
  default: { user: { findUnique, findFirst, findMany, create, updateMany } },
}));

// Imported AFTER the mock is registered (hoisting guarantees the order).
import { createApp } from '../src/app';

const app = createApp();

// ── Tenant layout ──────────────────────────────────────────────────────────
// Company A = 1 (the acting manager's company), Company B = 2, Platform = 9.
const COMPANY_A = 1;
const COMPANY_B = 2;
const PLATFORM = 9;

const MANAGER_ID = 1; // the acting COMPANY_MANAGER, in Company A
const WORKER_ID = 2; // a COMPANY_WORKER in Company A
const RENTER_B_ID = 3; // a RENTER in Company B
const SUPER_ID = 4; // a SUPER_ADMIN in the platform company

// A mutable in-memory table shared by every mocked method.
let users: UserRow[] = [];
let nextId = 100;

findUnique.mockImplementation(async ({ where }: { where: { email?: string; id?: number } }) => {
  if (where.email !== undefined) return users.find((u) => u.email === where.email) ?? null;
  if (where.id !== undefined) return users.find((u) => u.id === where.id) ?? null;
  return null;
});

findFirst.mockImplementation(async ({ where }: { where: { id?: number; companyId?: number } }) => {
  return (
    users.find(
      (u) =>
        (where.id === undefined || u.id === where.id) &&
        (where.companyId === undefined || u.companyId === where.companyId),
    ) ?? null
  );
});

findMany.mockImplementation(async ({ where }: { where?: { companyId?: number } }) => {
  return users.filter((u) => where?.companyId === undefined || u.companyId === where.companyId);
});

create.mockImplementation(
  async ({
    data,
  }: {
    data: { email: string; name: string; role: Role; companyId: number; passwordHash: string };
  }) => {
    const row: UserRow = {
      id: nextId++,
      email: data.email,
      name: data.name,
      role: data.role,
      companyId: data.companyId,
      passwordHash: data.passwordHash,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    users.push(row);
    return row;
  },
);

updateMany.mockImplementation(
  async ({
    where,
    data,
  }: {
    where: { id?: number; companyId?: number };
    data: Partial<UserRow>;
  }) => {
    const matches = users.filter(
      (u) =>
        (where.id === undefined || u.id === where.id) &&
        (where.companyId === undefined || u.companyId === where.companyId),
    );
    for (const u of matches) Object.assign(u, data);
    return { count: matches.length };
  },
);

const NOT_FOUND = 'User not found';
const FORBIDDEN = 'Forbidden';
const AUTH_REQUIRED = 'Authentication required';
// Same-origin value the CSRF check accepts in the test env; authenticated
// (cookie-bearing) POST/PATCH requests must send it (CSRF runs before authorize).
const ORIGIN = 'http://localhost:5173';

/** Cookie header for a signed session belonging to the given user id. */
function cookieFor(userId: number): string[] {
  // role/companyId in the token are snapshot-only; authenticate re-derives them
  // from the DB row, so only the id needs to be right.
  return [`token=${signToken(userId, Role.COMPANY_MANAGER, COMPANY_A)}`];
}

const managerCookie = () => cookieFor(MANAGER_ID);

const validCreateBody = (overrides: Record<string, unknown> = {}) => ({
  email: 'new-user@test.dev',
  name: 'New User',
  password: 'password123',
  role: Role.COMPANY_WORKER,
  ...overrides,
});

beforeEach(async () => {
  nextId = 100;
  users = [
    await makeUserRow({ id: MANAGER_ID, email: 'manager-a@test.dev', name: 'Manager A', role: Role.COMPANY_MANAGER, companyId: COMPANY_A }),
    await makeUserRow({ id: WORKER_ID, email: 'worker-a@test.dev', name: 'Worker A', role: Role.COMPANY_WORKER, companyId: COMPANY_A }),
    await makeUserRow({ id: RENTER_B_ID, email: 'renter-b@test.dev', name: 'Renter B', role: Role.RENTER, companyId: COMPANY_B }),
    await makeUserRow({ id: SUPER_ID, email: 'super@test.dev', name: 'Super Admin', role: Role.SUPER_ADMIN, companyId: PLATFORM }),
  ];
});

// ===========================================================================
// Role authorization
// ===========================================================================
describe('Role authorization', () => {
  // Case 1
  it('allows a COMPANY_MANAGER to access company-user endpoints', async () => {
    const res = await request(app).get('/api/users').set('Cookie', managerCookie());
    expect(res.status).toBe(200);
  });

  // Case 2
  it('forbids a COMPANY_WORKER (403)', async () => {
    const res = await request(app).get('/api/users').set('Cookie', cookieFor(WORKER_ID));
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(FORBIDDEN);
  });

  // Case 3
  it('forbids a RENTER (403)', async () => {
    const res = await request(app).get('/api/users').set('Cookie', cookieFor(RENTER_B_ID));
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(FORBIDDEN);
  });

  // Case 4
  it('rejects an unauthenticated request (401)', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe(AUTH_REQUIRED);
  });

  // SUPER_ADMIN gets no implicit bypass on company-scoped routes.
  it('forbids a SUPER_ADMIN on company-user endpoints (403, no bypass)', async () => {
    const res = await request(app).get('/api/users').set('Cookie', cookieFor(SUPER_ID));
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(FORBIDDEN);
  });

  it('forbids a COMPANY_WORKER from creating users (403)', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', cookieFor(WORKER_ID))
      .set('Origin', ORIGIN)
      .send(validCreateBody());
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// List isolation
// ===========================================================================
describe('GET /api/users — list isolation', () => {
  // Cases 5 & 6
  it('returns only users belonging to the manager’s company', async () => {
    const res = await request(app).get('/api/users').set('Cookie', managerCookie());

    expect(res.status).toBe(200);
    const returned = res.body.users as Array<{ id: number; companyId: number }>;
    expect(returned.every((u) => u.companyId === COMPANY_A)).toBe(true);
    expect(returned.map((u) => u.id).sort()).toEqual([MANAGER_ID, WORKER_ID]);
  });

  it('never returns another company’s users', async () => {
    const res = await request(app).get('/api/users').set('Cookie', managerCookie());
    const ids = (res.body.users as Array<{ id: number }>).map((u) => u.id);
    expect(ids).not.toContain(RENTER_B_ID); // Company B
    expect(ids).not.toContain(SUPER_ID); // platform company
  });
});

// ===========================================================================
// Get isolation
// ===========================================================================
describe('GET /api/users/:id — get isolation', () => {
  // Case 7
  it('returns a same-company user', async () => {
    const res = await request(app).get(`/api/users/${WORKER_ID}`).set('Cookie', managerCookie());
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(WORKER_ID);
    expect(res.body.user.companyId).toBe(COMPANY_A);
  });

  // Case 8
  it('returns 404 for a foreign-company user (does not reveal existence)', async () => {
    const res = await request(app).get(`/api/users/${RENTER_B_ID}`).set('Cookie', managerCookie());
    expect(res.status).toBe(404);
    expect(res.body.message).toBe(NOT_FOUND);
  });

  // Case 9
  it('returns 404 for a nonexistent id', async () => {
    const res = await request(app).get('/api/users/9999').set('Cookie', managerCookie());
    expect(res.status).toBe(404);
    expect(res.body.message).toBe(NOT_FOUND);
  });
});

// ===========================================================================
// Create isolation
// ===========================================================================
describe('POST /api/users — create isolation', () => {
  // Case 10
  it('always sets companyId to the authenticated manager’s company', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .send(validCreateBody({ email: 'c10@test.dev' }));

    expect(res.status).toBe(201);
    expect(res.body.user.companyId).toBe(COMPANY_A);
  });

  // Case 11
  it('ignores a client-supplied companyId and uses the manager’s company', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .send(validCreateBody({ email: 'c11@test.dev', companyId: COMPANY_B }));

    expect(res.status).toBe(201);
    expect(res.body.user.companyId).toBe(COMPANY_A);
    // And the row was actually stored in Company A, not B.
    expect(users.find((u) => u.email === 'c11@test.dev')?.companyId).toBe(COMPANY_A);
  });

  // Case 12
  it('rejects creating a SUPER_ADMIN (400)', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .send(validCreateBody({ email: 'c12@test.dev', role: 'SUPER_ADMIN' }));

    expect(res.status).toBe(400);
    expect(users.some((u) => u.email === 'c12@test.dev')).toBe(false);
  });

  // Case 13
  it('creates a COMPANY_WORKER', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .send(validCreateBody({ email: 'c13@test.dev', role: Role.COMPANY_WORKER }));

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('COMPANY_WORKER');
  });

  // Case 14
  it('creates a RENTER', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .send(validCreateBody({ email: 'c14@test.dev', role: Role.RENTER }));

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('RENTER');
  });

  // Case 15
  it('rejects a duplicate email (409)', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .send(validCreateBody({ email: 'worker-a@test.dev' }));

    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Email already in use');
  });
});

// ===========================================================================
// Update isolation
// ===========================================================================
describe('PATCH /api/users/:id — update isolation', () => {
  // Case 16
  it('updates a same-company user', async () => {
    const res = await request(app)
      .patch(`/api/users/${WORKER_ID}`)
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .send({ name: 'Renamed Worker' });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Renamed Worker');
    expect(users.find((u) => u.id === WORKER_ID)?.name).toBe('Renamed Worker');
  });

  // Case 17
  it('cannot update a foreign-company user (404)', async () => {
    const res = await request(app)
      .patch(`/api/users/${RENTER_B_ID}`)
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .send({ name: 'Hacked' });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe(NOT_FOUND);
    expect(users.find((u) => u.id === RENTER_B_ID)?.name).toBe('Renter B'); // untouched
  });

  // Case 18
  it('cannot change companyId through PATCH (field is stripped)', async () => {
    const res = await request(app)
      .patch(`/api/users/${WORKER_ID}`)
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .send({ name: 'Still A', companyId: COMPANY_B });

    expect(res.status).toBe(200);
    expect(res.body.user.companyId).toBe(COMPANY_A);
    expect(users.find((u) => u.id === WORKER_ID)?.companyId).toBe(COMPANY_A);
  });

  // Case 19
  it('cannot change a role to SUPER_ADMIN (400)', async () => {
    const res = await request(app)
      .patch(`/api/users/${WORKER_ID}`)
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .send({ role: 'SUPER_ADMIN' });

    expect(res.status).toBe(400);
    expect(users.find((u) => u.id === WORKER_ID)?.role).toBe('COMPANY_WORKER'); // untouched
  });

  // Case 20
  it('forbids a manager changing their own role (403)', async () => {
    const res = await request(app)
      .patch(`/api/users/${MANAGER_ID}`)
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .send({ role: Role.COMPANY_WORKER });

    expect(res.status).toBe(403);
    expect(users.find((u) => u.id === MANAGER_ID)?.role).toBe('COMPANY_MANAGER'); // untouched
  });

  it('allows a manager to update their own profile fields (not role)', async () => {
    const res = await request(app)
      .patch(`/api/users/${MANAGER_ID}`)
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .send({ name: 'Manager Renamed' });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Manager Renamed');
    expect(res.body.user.role).toBe('COMPANY_MANAGER');
  });
});

// ===========================================================================
// Response safety
// ===========================================================================
describe('Response safety — passwordHash never leaks', () => {
  // Case 21
  it('omits passwordHash from list, get, create and update responses', async () => {
    const list = await request(app).get('/api/users').set('Cookie', managerCookie());
    expect(JSON.stringify(list.body)).not.toContain('passwordHash');

    const get = await request(app).get(`/api/users/${WORKER_ID}`).set('Cookie', managerCookie());
    expect(JSON.stringify(get.body)).not.toContain('passwordHash');

    const created = await request(app)
      .post('/api/users')
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .send(validCreateBody({ email: 'safe@test.dev' }));
    expect(created.body.user).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(created.body)).not.toContain('passwordHash');

    const updated = await request(app)
      .patch(`/api/users/${WORKER_ID}`)
      .set('Cookie', managerCookie())
      .set('Origin', ORIGIN)
      .send({ name: 'Safe Worker' });
    expect(updated.body.user).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(updated.body)).not.toContain('passwordHash');
  });
});
