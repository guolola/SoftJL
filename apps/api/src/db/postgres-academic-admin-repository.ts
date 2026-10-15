// Persists academic admin organizations, courses, classes, teams, memberships, and quotas in PostgreSQL.
import { randomUUID } from "node:crypto";
import {
  adminClassDtoSchema,
  adminCourseDtoSchema,
  adminOrganizationDtoSchema,
  adminOrganizationMembershipDtoSchema,
  adminQuotaDtoSchema,
  adminTeamDtoSchema,
  type AdminClassCreateRequest,
  type AdminCourseCreateRequest,
  type AdminOrganizationCreateRequest,
  type AdminOrganizationMembershipCreateRequest,
  type AdminOrganizationMembershipTargetType,
  type AdminQuotaCreateRequest,
  type AdminTeamCreateRequest,
} from "@uml-platform/contracts";
import type { AcademicAdminRepository } from "./academic-admin-repository.js";
import type { Queryable } from "./transactions.js";

type OrganizationRow = {
  id: string;
  name: string;
  code: string | null;
  type: string;
  status: string;
  created_at: string | Date;
  updated_at: string | Date;
};

type CourseRow = {
  id: string;
  organization_id: string;
  name: string;
  code: string | null;
  term: string | null;
  status: string;
  created_at: string | Date;
  updated_at: string | Date;
};

type ClassRow = {
  id: string;
  course_id: string;
  name: string;
  code: string | null;
  status: string;
  created_at: string | Date;
  updated_at: string | Date;
};

type TeamRow = {
  id: string;
  class_id: string;
  name: string;
  code: string | null;
  status: string;
  created_at: string | Date;
  updated_at: string | Date;
};

type MembershipRow = {
  id: string;
  target_type: string;
  target_id: string;
  user_id: string | null;
  email: string | null;
  display_name: string | null;
  role: string;
  status: string;
  created_at: string | Date;
  updated_at: string | Date;
};

type QuotaRow = {
  id: string;
  scope_type: string;
  scope_id: string;
  resource: string;
  limit_count: number | string;
  used_count: number | string;
  reset_period: string;
  created_at: string | Date;
  updated_at: string | Date;
};

function toIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}

function mapOrganization(row: OrganizationRow) {
  return adminOrganizationDtoSchema.parse({
    id: row.id,
    name: row.name,
    code: row.code,
    type: row.type,
    status: row.status,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  });
}

function mapCourse(row: CourseRow) {
  return adminCourseDtoSchema.parse({
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    code: row.code,
    term: row.term,
    status: row.status,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  });
}

function mapClass(row: ClassRow) {
  return adminClassDtoSchema.parse({
    id: row.id,
    courseId: row.course_id,
    name: row.name,
    code: row.code,
    status: row.status,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  });
}

function mapTeam(row: TeamRow) {
  return adminTeamDtoSchema.parse({
    id: row.id,
    classId: row.class_id,
    name: row.name,
    code: row.code,
    status: row.status,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  });
}

function mapMembership(row: MembershipRow) {
  return adminOrganizationMembershipDtoSchema.parse({
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  });
}

function mapQuota(row: QuotaRow) {
  return adminQuotaDtoSchema.parse({
    id: row.id,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    resource: row.resource,
    limit: Number(row.limit_count),
    used: Number(row.used_count),
    resetPeriod: row.reset_period,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  });
}

const organizationColumns = `
  id,
  name,
  code,
  type,
  status,
  created_at,
  updated_at
`;

const courseColumns = `
  id,
  organization_id,
  name,
  code,
  term,
  status,
  created_at,
  updated_at
`;

const classColumns = `
  id,
  course_id,
  name,
  code,
  status,
  created_at,
  updated_at
`;

const teamColumns = `
  id,
  class_id,
  name,
  code,
  status,
  created_at,
  updated_at
`;

const membershipColumns = `
  id,
  target_type,
  target_id,
  user_id,
  email,
  display_name,
  role,
  status,
  created_at,
  updated_at
`;

const quotaColumns = `
  id,
  scope_type,
  scope_id,
  resource,
  limit_count,
  used_count,
  reset_period,
  created_at,
  updated_at
`;

async function exists(db: Queryable, table: string, id: string) {
  const result = await db.query<{ id: string }>(
    `select id from ${table} where id = $1 limit 1`,
    [id],
  );
  return result.rows.length > 0;
}

export function createPostgresAcademicAdminRepository(
  db: Queryable,
): AcademicAdminRepository {
  return {
    async listOrganizations() {
      const result = await db.query<OrganizationRow>(
        `select ${organizationColumns} from organizations order by created_at asc, id asc`,
      );
      return result.rows.map(mapOrganization);
    },
    async getOrganization(id) {
      const result = await db.query<OrganizationRow>(
        `select ${organizationColumns} from organizations where id = $1`,
        [id],
      );
      return result.rows[0] ? mapOrganization(result.rows[0]) : null;
    },
    async organizationExists(id) {
      return exists(db, "organizations", id);
    },
    async createOrganization(input: AdminOrganizationCreateRequest) {
      const result = await db.query<OrganizationRow>(
        `
          insert into organizations (id, name, code, type, status)
          values ($1, $2, $3, $4, $5)
          returning ${organizationColumns}
        `,
        [
          randomUUID(),
          input.name,
          input.code ?? null,
          input.type ?? "school",
          input.status ?? "active",
        ],
      );
      return mapOrganization(result.rows[0]);
    },

    async listCourses() {
      const result = await db.query<CourseRow>(
        `select ${courseColumns} from courses order by created_at asc, id asc`,
      );
      return result.rows.map(mapCourse);
    },
    async getCourse(id) {
      const result = await db.query<CourseRow>(
        `select ${courseColumns} from courses where id = $1`,
        [id],
      );
      return result.rows[0] ? mapCourse(result.rows[0]) : null;
    },
    async courseExists(id) {
      return exists(db, "courses", id);
    },
    async createCourse(input: AdminCourseCreateRequest) {
      const result = await db.query<CourseRow>(
        `
          insert into courses (id, organization_id, name, code, term, status)
          values ($1, $2, $3, $4, $5, $6)
          returning ${courseColumns}
        `,
        [
          randomUUID(),
          input.organizationId,
          input.name,
          input.code ?? null,
          input.term ?? null,
          input.status ?? "active",
        ],
      );
      return mapCourse(result.rows[0]);
    },

    async listClasses() {
      const result = await db.query<ClassRow>(
        `select ${classColumns} from classes order by created_at asc, id asc`,
      );
      return result.rows.map(mapClass);
    },
    async getClass(id) {
      const result = await db.query<ClassRow>(
        `select ${classColumns} from classes where id = $1`,
        [id],
      );
      return result.rows[0] ? mapClass(result.rows[0]) : null;
    },
    async classExists(id) {
      return exists(db, "classes", id);
    },
    async createClass(input: AdminClassCreateRequest) {
      const result = await db.query<ClassRow>(
        `
          insert into classes (id, course_id, name, code, status)
          values ($1, $2, $3, $4, $5)
          returning ${classColumns}
        `,
        [
          randomUUID(),
          input.courseId,
          input.name,
          input.code ?? null,
          input.status ?? "active",
        ],
      );
      return mapClass(result.rows[0]);
    },

    async listTeams() {
      const result = await db.query<TeamRow>(
        `select ${teamColumns} from teams order by created_at asc, id asc`,
      );
      return result.rows.map(mapTeam);
    },
    async getTeam(id) {
      const result = await db.query<TeamRow>(
        `select ${teamColumns} from teams where id = $1`,
        [id],
      );
      return result.rows[0] ? mapTeam(result.rows[0]) : null;
    },
    async teamExists(id) {
      return exists(db, "teams", id);
    },
    async createTeam(input: AdminTeamCreateRequest) {
      const result = await db.query<TeamRow>(
        `
          insert into teams (id, class_id, name, code, status)
          values ($1, $2, $3, $4, $5)
          returning ${teamColumns}
        `,
        [
          randomUUID(),
          input.classId,
          input.name,
          input.code ?? null,
          input.status ?? "active",
        ],
      );
      return mapTeam(result.rows[0]);
    },

    async listMemberships() {
      const result = await db.query<MembershipRow>(
        `select ${membershipColumns} from organization_memberships order by created_at asc, id asc`,
      );
      return result.rows.map(mapMembership);
    },
    async createMembership(input: AdminOrganizationMembershipCreateRequest) {
      const result = await db.query<MembershipRow>(
        `
          insert into organization_memberships (
            id,
            target_type,
            target_id,
            user_id,
            email,
            display_name,
            role,
            status
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8)
          returning ${membershipColumns}
        `,
        [
          randomUUID(),
          input.targetType,
          input.targetId,
          input.userId ?? null,
          input.email ?? null,
          input.displayName ?? null,
          input.role,
          input.status ?? "active",
        ],
      );
      return mapMembership(result.rows[0]);
    },

    async listQuotas() {
      const result = await db.query<QuotaRow>(
        `select ${quotaColumns} from quotas order by created_at asc, id asc`,
      );
      return result.rows.map(mapQuota);
    },
    async getQuota(id) {
      const result = await db.query<QuotaRow>(
        `select ${quotaColumns} from quotas where id = $1`,
        [id],
      );
      return result.rows[0] ? mapQuota(result.rows[0]) : null;
    },
    async createQuota(input: AdminQuotaCreateRequest) {
      const result = await db.query<QuotaRow>(
        `
          insert into quotas (
            id,
            scope_type,
            scope_id,
            resource,
            limit_count,
            used_count,
            reset_period
          )
          values ($1, $2, $3, $4, $5, $6, $7)
          returning ${quotaColumns}
        `,
        [
          randomUUID(),
          input.scopeType,
          input.scopeId,
          input.resource,
          input.limit,
          input.used ?? 0,
          input.resetPeriod ?? "none",
        ],
      );
      return mapQuota(result.rows[0]);
    },

    async targetExists(
      targetType: AdminOrganizationMembershipTargetType,
      targetId: string,
    ) {
      if (targetType === "organization") return this.organizationExists(targetId);
      if (targetType === "course") return this.courseExists(targetId);
      if (targetType === "class") return this.classExists(targetId);
      return this.teamExists(targetId);
    },
  };
}

