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
