/**
 * Inter-service HTTP client (§10.1 rule 3).
 *
 * Services communicate synchronously via REST for critical paths.
 * Each service registers its base URL via env vars.
 */

export interface ServiceUrls {
  authService?: string;
  progressService?: string;
  contentService?: string;
  classroomService?: string;
  asrService?: string;
}

function getUrls(): ServiceUrls {
  return {
    authService: process.env.AUTH_SERVICE_URL ?? 'http://localhost:3001',
    progressService: process.env.PROGRESS_SERVICE_URL ?? 'http://localhost:3002',
    contentService: process.env.CONTENT_SERVICE_URL ?? 'http://localhost:3003',
    classroomService: process.env.CLASSROOM_SERVICE_URL ?? 'http://localhost:3004',
    asrService: process.env.ASR_SERVICE_URL ?? 'http://localhost:8080',
  };
}

/**
 * Generic internal HTTP client with service-discovery + auth propagation.
 * Pass the caller's JWT for user-context requests, or an internal service
 * token for system-to-system calls.
 */
export class InterServiceClient {
  constructor(private authToken?: string) {}

  private async request(
    baseUrl: string,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const url = `${baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const err = new Error(
        `Inter-service call failed: ${method} ${path} → ${response.status}`,
      ) as Error & { status?: number; code?: string };
      err.status = response.status;
      err.code = (errorBody as { error?: { code?: string } })?.error?.code;
      throw err;
    }

    if (response.status === 204) return null;
    return response.json();
  }

  // --- Progress service ---
  async getStudentFluency(studentId: string): Promise<unknown> {
    return this.request(
      getUrls().progressService!,
      'GET',
      `/api/v1/progress/students/${studentId}/fluency`,
    );
  }

  async getStudentSummary(studentId: string): Promise<unknown> {
    return this.request(
      getUrls().progressService!,
      'GET',
      `/api/v1/progress/students/${studentId}/summary`,
    );
  }

  // --- Content service ---
  async getWorld(contentId: string): Promise<unknown> {
    return this.request(
      getUrls().contentService!,
      'GET',
      `/api/v1/content/${contentId}`,
    );
  }

  async getWorldGates(contentId: string): Promise<unknown[]> {
    const gates = await this.request(
      getUrls().contentService!,
      'GET',
      `/api/v1/content/${contentId}/gates`,
    );
    return gates as unknown[];
  }

  // --- Classroom service ---
  async getClassroomMembers(classroomId: string): Promise<
    Array<{ userId: string; role: string }>
  > {
    const result = await this.request(
      getUrls().classroomService!,
      'GET',
      `/api/v1/classrooms/${classroomId}/members`,
    );
    return result as Array<{ userId: string; role: string }>;
  }

  async getTeacherClassrooms(_teacherId: string): Promise<unknown[]> {
    // Would call classroom-service; here returns empty for now
    return [];
  }
}
