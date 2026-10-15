// Verifies PostgreSQL-backed academic admin data keeps the existing admin API DTO contract.
import assert from "node:assert/strict";
import test from "node:test";
import { createPostgresAcademicAdminRepository } from "./postgres-academic-admin-repository.js";
import type { Queryable } from "./transactions.js";

class ScriptedClient implements Queryable {
  readonly calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  private readonly queuedRows: unknown[][] = [];

  queueRows(rows: unknown[]) {
    this.queuedRows.push(rows);
  }

  async query(sql: string, params: readonly unknown[] = []) {
    this.calls.push({ sql, params });
    const rows = this.queuedRows.shift() ?? [];
    return { rows, rowCount: rows.length };
  }
}

const organizationRow = {
  id: "org-1",
  name: "Engineering School",
  code: "ENG",
  type: "school",
  status: "active",
  created_at: "2026-05-22T00:00:00.000Z",
  updated_at: "2026-05-22T00:00:00.000Z",
};

const courseRow = {
  id: "course-1",
  organization_id: "org-1",
  name: "Software Engineering",
  code: "SE101",
  term: "2026 Spring",
  status: "active",
  created_at: "2026-05-22T00:01:00.000Z",
  updated_at: "2026-05-22T00:01:00.000Z",
};

const classRow = {
  id: "class-1",
  course_id: "course-1",
  name: "Class One",
  code: null,
  status: "active",
  created_at: "2026-05-22T00:02:00.000Z",
  updated_at: "2026-05-22T00:02:00.000Z",
};

const teamRow = {
  id: "team-1",
  class_id: "class-1",
  name: "Team A",
  code: null,
  status: "active",
  created_at: "2026-05-22T00:03:00.000Z",
  updated_at: "2026-05-22T00:03:00.000Z",
};

const membershipRow = {
  id: "membership-1",
  target_type: "course",
  target_id: "course-1",
  user_id: "user-1",
  email: "student@example.com",
  display_name: "Student One",
  role: "student",
  status: "active",
  created_at: "2026-05-22T00:04:00.000Z",
  updated_at: "2026-05-22T00:04:00.000Z",
};

const quotaRow = {
  id: "quota-1",
  scope_type: "course",
  scope_id: "course-1",
  resource: "runs",
  limit_count: 120,
  used_count: 3,
  reset_period: "monthly",
  created_at: "2026-05-22T00:05:00.000Z",
  updated_at: "2026-05-22T00:05:00.000Z",
};

test("postgres academic admin repository creates and lists persistent academic records", async () => {
  const client = new ScriptedClient();
  client.queueRows([organizationRow]);
  client.queueRows([courseRow]);
  client.queueRows([classRow]);
  client.queueRows([teamRow]);
  client.queueRows([membershipRow]);
  client.queueRows([quotaRow]);
  client.queueRows([organizationRow]);
  client.queueRows([courseRow]);
  client.queueRows([classRow]);
  client.queueRows([teamRow]);
  client.queueRows([membershipRow]);
  client.queueRows([quotaRow]);

  const repository = createPostgresAcademicAdminRepository(client);

  const organization = await repository.createOrganization({
    name: "Engineering School",
    code: "ENG",
    type: "school",
    status: "active",
  });
  const course = await repository.createCourse({
    organizationId: organization.id,
    name: "Software Engineering",
    code: "SE101",
    term: "2026 Spring",
    status: "active",
  });
  const classRecord = await repository.createClass({
    courseId: course.id,
    name: "Class One",
    code: null,
    status: "active",
  });
  const team = await repository.createTeam({
    classId: classRecord.id,
    name: "Team A",
    code: null,
    status: "active",
  });
  const membership = await repository.createMembership({
    targetType: "course",
    targetId: course.id,
    userId: "user-1",
    email: "student@example.com",
    displayName: "Student One",
    role: "student",
    status: "active",
  });
  const quota = await repository.createQuota({
    scopeType: "course",
    scopeId: course.id,
    resource: "runs",
    limit: 120,
    used: 3,
    resetPeriod: "monthly",
  });

  const restartedRepository = createPostgresAcademicAdminRepository(client);

  assert.equal(organization.name, "Engineering School");
  assert.equal(course.organizationId, "org-1");
  assert.equal(classRecord.courseId, "course-1");
  assert.equal(team.classId, "class-1");
  assert.equal(membership.displayName, "Student One");
  assert.equal(quota.limit, 120);
  assert.deepEqual(await restartedRepository.listOrganizations(), [organization]);
  assert.deepEqual(await restartedRepository.listCourses(), [course]);
  assert.deepEqual(await restartedRepository.listClasses(), [classRecord]);
  assert.deepEqual(await restartedRepository.listTeams(), [team]);
  assert.deepEqual(await restartedRepository.listMemberships(), [membership]);
  assert.deepEqual(await restartedRepository.listQuotas(), [quota]);
  assert.match(client.calls[0]?.sql ?? "", /insert into organizations/i);
  assert.match(client.calls[6]?.sql ?? "", /select[\s\S]+from organizations/i);
});

