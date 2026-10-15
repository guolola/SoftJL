// Defines the academic admin repository contract shared by in-memory and PostgreSQL stores.
import { randomUUID } from "node:crypto";
import {
  adminClassDtoSchema,
  adminCourseDtoSchema,
  adminOrganizationDtoSchema,
  adminOrganizationMembershipDtoSchema,
  adminQuotaDtoSchema,
  adminTeamDtoSchema,
  type AdminClassCreateRequest,
  type AdminClassDto,
  type AdminCourseCreateRequest,
  type AdminCourseDto,
  type AdminOrganizationCreateRequest,
  type AdminOrganizationDto,
  type AdminOrganizationMembershipCreateRequest,
  type AdminOrganizationMembershipDto,
  type AdminOrganizationMembershipTargetType,
  type AdminQuotaCreateRequest,
  type AdminQuotaDto,
  type AdminTeamCreateRequest,
  type AdminTeamDto,
} from "@uml-platform/contracts";

export interface AcademicAdminRepository {
  listOrganizations(): Promise<AdminOrganizationDto[]>;
  getOrganization(id: string): Promise<AdminOrganizationDto | null>;
  organizationExists(id: string): Promise<boolean>;
  createOrganization(
    input: AdminOrganizationCreateRequest,
  ): Promise<AdminOrganizationDto>;

  listCourses(): Promise<AdminCourseDto[]>;
  getCourse(id: string): Promise<AdminCourseDto | null>;
  courseExists(id: string): Promise<boolean>;
  createCourse(input: AdminCourseCreateRequest): Promise<AdminCourseDto>;

  listClasses(): Promise<AdminClassDto[]>;
  getClass(id: string): Promise<AdminClassDto | null>;
  classExists(id: string): Promise<boolean>;
  createClass(input: AdminClassCreateRequest): Promise<AdminClassDto>;

  listTeams(): Promise<AdminTeamDto[]>;
  getTeam(id: string): Promise<AdminTeamDto | null>;
  teamExists(id: string): Promise<boolean>;
  createTeam(input: AdminTeamCreateRequest): Promise<AdminTeamDto>;

  listMemberships(): Promise<AdminOrganizationMembershipDto[]>;
  createMembership(
    input: AdminOrganizationMembershipCreateRequest,
  ): Promise<AdminOrganizationMembershipDto>;

  listQuotas(): Promise<AdminQuotaDto[]>;
  getQuota(id: string): Promise<AdminQuotaDto | null>;
  createQuota(input: AdminQuotaCreateRequest): Promise<AdminQuotaDto>;

  targetExists(
    targetType: AdminOrganizationMembershipTargetType,
    targetId: string,
  ): Promise<boolean>;
}

export function createInMemoryAcademicAdminRepository(): AcademicAdminRepository {
  const organizations = new Map<string, AdminOrganizationDto>();
  const courses = new Map<string, AdminCourseDto>();
  const classes = new Map<string, AdminClassDto>();
  const teams = new Map<string, AdminTeamDto>();
  const memberships = new Map<string, AdminOrganizationMembershipDto>();
  const quotas = new Map<string, AdminQuotaDto>();

  function now() {
    return new Date().toISOString();
  }

  function ordered<T>(items: Iterable<T>) {
    return Array.from(items);
  }

  return {
    async listOrganizations() {
      return ordered(organizations.values());
    },
    async getOrganization(id) {
      return organizations.get(id) ?? null;
    },
    async organizationExists(id) {
      return organizations.has(id);
    },
    async createOrganization(input) {
      const createdAt = now();
      const organization = adminOrganizationDtoSchema.parse({
        id: randomUUID(),
        ...input,
        createdAt,
        updatedAt: createdAt,
      });
      organizations.set(organization.id, organization);
      return organization;
    },
    async listCourses() {
      return ordered(courses.values());
    },
    async getCourse(id) {
      return courses.get(id) ?? null;
    },
    async courseExists(id) {
      return courses.has(id);
    },
    async createCourse(input) {
      const createdAt = now();
      const course = adminCourseDtoSchema.parse({
        id: randomUUID(),
        ...input,
        createdAt,
        updatedAt: createdAt,
      });
      courses.set(course.id, course);
      return course;
    },
    async listClasses() {
      return ordered(classes.values());
    },
    async getClass(id) {
      return classes.get(id) ?? null;
    },
    async classExists(id) {
      return classes.has(id);
    },
    async createClass(input) {
      const createdAt = now();
      const classRecord = adminClassDtoSchema.parse({
        id: randomUUID(),
        ...input,
        createdAt,
        updatedAt: createdAt,
      });
      classes.set(classRecord.id, classRecord);
      return classRecord;
    },
    async listTeams() {
      return ordered(teams.values());
    },
    async getTeam(id) {
      return teams.get(id) ?? null;
    },
    async teamExists(id) {
      return teams.has(id);
    },
    async createTeam(input) {
      const createdAt = now();
      const team = adminTeamDtoSchema.parse({
        id: randomUUID(),
        ...input,
        createdAt,
        updatedAt: createdAt,
      });
      teams.set(team.id, team);
      return team;
    },
    async listMemberships() {
      return ordered(memberships.values());
    },
    async createMembership(input) {
      const createdAt = now();
      const membership = adminOrganizationMembershipDtoSchema.parse({
        id: randomUUID(),
        targetType: input.targetType,
        targetId: input.targetId,
        userId: input.userId ?? null,
        email: input.email ?? null,
        displayName: input.displayName ?? null,
        role: input.role,
        status: input.status,
        createdAt,
        updatedAt: createdAt,
      });
      memberships.set(membership.id, membership);
      return membership;
    },
    async listQuotas() {
      return ordered(quotas.values());
    },
    async getQuota(id) {
      return quotas.get(id) ?? null;
    },
    async createQuota(input) {
      const createdAt = now();
      const quota = adminQuotaDtoSchema.parse({
        id: randomUUID(),
        ...input,
        createdAt,
        updatedAt: createdAt,
      });
      quotas.set(quota.id, quota);
      return quota;
    },
    async targetExists(targetType, targetId) {
      if (targetType === "organization") return organizations.has(targetId);
      if (targetType === "course") return courses.has(targetId);
      if (targetType === "class") return classes.has(targetId);
      return teams.has(targetId);
    },
  };
}

