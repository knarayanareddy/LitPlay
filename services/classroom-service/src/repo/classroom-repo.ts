/**
 * Classroom repository — classrooms, members, join codes, goals (§10.6, §19).
 */

export interface ClassroomRecord {
  id: string;
  name: string;
  teacherId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface JoinCodeRecord {
  classroomId: string;
  code: string;
  expiresAt: string;
  createdAt: string;
}

export interface ClassroomMemberRecord {
  classroomId: string;
  userId: string;
  role: 'student' | 'teacher';
  joinedAt: string;
}

export interface StudentGoalRecord {
  studentId: string;
  classroomId: string;
  targetWpm: number;
  minutesPerWeek: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClassroomRepository {
  createClassroom(c: ClassroomRecord): Promise<ClassroomRecord>;
  getClassroom(id: string): Promise<ClassroomRecord | null>;
  updateClassroom(id: string, patch: Partial<ClassroomRecord>): Promise<ClassroomRecord>;
  deleteClassroom(id: string): Promise<void>;
  setJoinCode(code: JoinCodeRecord): Promise<void>;
  getJoinCode(code: string): Promise<JoinCodeRecord | null>;
  getJoinCodeByClassroom(classroomId: string): Promise<JoinCodeRecord | null>;
  addMember(m: ClassroomMemberRecord): Promise<void>;
  removeMember(classroomId: string, userId: string): Promise<void>;
  listMembers(classroomId: string): Promise<ClassroomMemberRecord[]>;
  setGoal(g: StudentGoalRecord): Promise<StudentGoalRecord>;
  getGoal(studentId: string, classroomId: string): Promise<StudentGoalRecord | null>;
}

export class InMemoryClassroomRepository implements ClassroomRepository {
  classrooms = new Map<string, ClassroomRecord>();
  joinCodes = new Map<string, JoinCodeRecord>(); // keyed by code
  joinCodeByClassroom = new Map<string, string>(); // classroomId → code
  members = new Map<string, ClassroomMemberRecord>(); // key: classroomId:userId
  goals = new Map<string, StudentGoalRecord>(); // key: studentId:classroomId

  async createClassroom(c: ClassroomRecord): Promise<ClassroomRecord> {
    this.classrooms.set(c.id, c);
    return c;
  }

  async getClassroom(id: string): Promise<ClassroomRecord | null> {
    return this.classrooms.get(id) ?? null;
  }

  async updateClassroom(id: string, patch: Partial<ClassroomRecord>): Promise<ClassroomRecord> {
    const c = this.classrooms.get(id);
    if (!c) throw new Error(`Classroom ${id} not found`);
    Object.assign(c, patch, { updatedAt: new Date().toISOString() });
    return c;
  }

  async deleteClassroom(id: string): Promise<void> {
    const c = this.classrooms.get(id);
    if (c) c.deletedAt = new Date().toISOString();
  }

  async setJoinCode(code: JoinCodeRecord): Promise<void> {
    this.joinCodes.set(code.code, code);
    this.joinCodeByClassroom.set(code.classroomId, code.code);
  }

  async getJoinCode(code: string): Promise<JoinCodeRecord | null> {
    return this.joinCodes.get(code.toUpperCase()) ?? null;
  }

  async getJoinCodeByClassroom(classroomId: string): Promise<JoinCodeRecord | null> {
    const code = this.joinCodeByClassroom.get(classroomId);
    return code ? this.joinCodes.get(code) ?? null : null;
  }

  async addMember(m: ClassroomMemberRecord): Promise<void> {
    this.members.set(`${m.classroomId}:${m.userId}`, m);
  }

  async removeMember(classroomId: string, userId: string): Promise<void> {
    this.members.delete(`${classroomId}:${userId}`);
  }

  async listMembers(classroomId: string): Promise<ClassroomMemberRecord[]> {
    return [...this.members.values()].filter((m) => m.classroomId === classroomId);
  }

  async setGoal(g: StudentGoalRecord): Promise<StudentGoalRecord> {
    this.goals.set(`${g.studentId}:${g.classroomId}`, g);
    return g;
  }

  async getGoal(studentId: string, classroomId: string): Promise<StudentGoalRecord | null> {
    return this.goals.get(`${studentId}:${classroomId}`) ?? null;
  }
}

// --- PostgreSQL implementation (production) ---------------------------------

import { Pool } from 'pg';

type ClassroomRow = { id:string; name:string; teacher_id:string; created_at:Date|string; updated_at:Date|string; deleted_at:Date|string|null };
type JoinRow = { classroom_id:string; code:string; expires_at:Date|string; created_at:Date|string };
type MemberRow = { classroom_id:string; user_id:string; role:'student'|'teacher'; joined_at:Date|string };
type GoalRow = { student_id:string; classroom_id:string; target_wpm:number; minutes_per_week:number; created_at:Date|string; updated_at:Date|string };
const iso3 = (v: Date|string|null|undefined) => v == null ? null : (v instanceof Date ? v.toISOString() : new Date(v).toISOString());
function mapClassroom(r: ClassroomRow): ClassroomRecord { return { id:r.id,name:r.name,teacherId:r.teacher_id,createdAt:iso3(r.created_at)!,updatedAt:iso3(r.updated_at)!,deletedAt:iso3(r.deleted_at) }; }
function mapJoin(r: JoinRow): JoinCodeRecord { return { classroomId:r.classroom_id, code:r.code, expiresAt:iso3(r.expires_at)!, createdAt:iso3(r.created_at)! }; }
function mapMember(r: MemberRow): ClassroomMemberRecord { return { classroomId:r.classroom_id, userId:r.user_id, role:r.role, joinedAt:iso3(r.joined_at)! }; }
function mapGoal(r: GoalRow): StudentGoalRecord { return { studentId:r.student_id,classroomId:r.classroom_id,targetWpm:r.target_wpm,minutesPerWeek:r.minutes_per_week,createdAt:iso3(r.created_at)!,updatedAt:iso3(r.updated_at)! }; }

export class PostgresClassroomRepository implements ClassroomRepository {
  private pool: Pool;
  constructor(connectionString = process.env.DATABASE_URL) { if (!connectionString) throw new Error('DATABASE_URL is required for PostgresClassroomRepository'); this.pool = new Pool({ connectionString }); }
  async createClassroom(c: ClassroomRecord): Promise<ClassroomRecord> { const { rows } = await this.pool.query<ClassroomRow>('INSERT INTO classrooms (id,name,teacher_id,created_at,updated_at,deleted_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',[c.id,c.name,c.teacherId,c.createdAt,c.updatedAt,c.deletedAt]); return mapClassroom(rows[0]); }
  async getClassroom(id: string): Promise<ClassroomRecord|null> { const { rows } = await this.pool.query<ClassroomRow>('SELECT * FROM classrooms WHERE id=$1',[id]); return rows[0]?mapClassroom(rows[0]):null; }
  async updateClassroom(id: string, patch: Partial<ClassroomRecord>): Promise<ClassroomRecord> { const current = await this.getClassroom(id); if (!current) throw new Error(`Classroom ${id} not found`); const next = { ...current, ...patch, updatedAt: new Date().toISOString() }; const { rows } = await this.pool.query<ClassroomRow>('UPDATE classrooms SET name=$2, updated_at=$3 WHERE id=$1 RETURNING *',[id,next.name,next.updatedAt]); return mapClassroom(rows[0]); }
  async deleteClassroom(id: string): Promise<void> { await this.pool.query('UPDATE classrooms SET deleted_at=now(), updated_at=now() WHERE id=$1',[id]); }
  async setJoinCode(code: JoinCodeRecord): Promise<void> { await this.pool.query('INSERT INTO join_codes (classroom_id,code,expires_at,created_at) VALUES ($1,$2,$3,$4) ON CONFLICT (classroom_id) DO UPDATE SET code=EXCLUDED.code, expires_at=EXCLUDED.expires_at, created_at=EXCLUDED.created_at',[code.classroomId,code.code,code.expiresAt,code.createdAt]); }
  async getJoinCode(code: string): Promise<JoinCodeRecord|null> { const { rows } = await this.pool.query<JoinRow>('SELECT * FROM join_codes WHERE code=$1',[code.toUpperCase()]); return rows[0]?mapJoin(rows[0]):null; }
  async getJoinCodeByClassroom(classroomId: string): Promise<JoinCodeRecord|null> { const { rows } = await this.pool.query<JoinRow>('SELECT * FROM join_codes WHERE classroom_id=$1',[classroomId]); return rows[0]?mapJoin(rows[0]):null; }
  async addMember(m: ClassroomMemberRecord): Promise<void> { await this.pool.query('INSERT INTO classroom_members (classroom_id,user_id,role,joined_at,created_at,updated_at) VALUES ($1,$2,$3,$4,now(),now()) ON CONFLICT (classroom_id,user_id) DO NOTHING',[m.classroomId,m.userId,m.role,m.joinedAt]); }
  async removeMember(classroomId: string, userId: string): Promise<void> { await this.pool.query('DELETE FROM classroom_members WHERE classroom_id=$1 AND user_id=$2',[classroomId,userId]); }
  async listMembers(classroomId: string): Promise<ClassroomMemberRecord[]> { const { rows } = await this.pool.query<MemberRow>('SELECT classroom_id,user_id,role,joined_at FROM classroom_members WHERE classroom_id=$1 ORDER BY joined_at',[classroomId]); return rows.map(mapMember); }
  async setGoal(g: StudentGoalRecord): Promise<StudentGoalRecord> { const { rows } = await this.pool.query<GoalRow>('INSERT INTO student_goals (student_id,classroom_id,target_wpm,minutes_per_week,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (student_id,classroom_id) DO UPDATE SET target_wpm=EXCLUDED.target_wpm, minutes_per_week=EXCLUDED.minutes_per_week, updated_at=EXCLUDED.updated_at RETURNING *',[g.studentId,g.classroomId,g.targetWpm,g.minutesPerWeek,g.createdAt,g.updatedAt]); return mapGoal(rows[0]); }
  async getGoal(studentId: string, classroomId: string): Promise<StudentGoalRecord|null> { const { rows } = await this.pool.query<GoalRow>('SELECT * FROM student_goals WHERE student_id=$1 AND classroom_id=$2',[studentId,classroomId]); return rows[0]?mapGoal(rows[0]):null; }
}
