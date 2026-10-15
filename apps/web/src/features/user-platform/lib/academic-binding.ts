// Builds course/team binding options shared by project creation and settings forms.
import type { platformApi } from "../services/platform-api";

type AcademicOptionsResponse = Awaited<ReturnType<typeof platformApi.listAcademicOptions>>;

export type AcademicBindingOption = {
  value: string;
  label: string;
  organizationId: string | null;
  courseId: string | null;
  classId: string | null;
  teamId: string | null;
};

export const UNASSIGNED_ACADEMIC_OPTION: AcademicBindingOption = {
  value: "unassigned",
  label: "暂不绑定课程团队",
  organizationId: null,
  courseId: null,
  classId: null,
  teamId: null,
};

export const ACADEMIC_BINDING_OPTIONS: AcademicBindingOption[] = [
  {
    value: "software-2026-spring",
    label: "软件工程 2026 春 / 1 班 / Team A",
    organizationId: "org-software-school",
    courseId: "course-software-2026-spring",
    classId: "class-software-2026-spring-1",
    teamId: "team-software-2026-a",
  },
  {
    value: "software-2026-lab2",
    label: "软件工程 2026 春 / 2 班 / Team B",
    organizationId: "org-software-school",
    courseId: "course-software-2026-spring",
    classId: "class-software-2026-spring-2",
    teamId: "team-software-2026-b",
  },
  {
    value: "unassigned",
    label: "暂不绑定课程团队",
    organizationId: null,
    courseId: null,
    classId: null,
    teamId: null,
  },
];

export function academicBindingFromValue(
  value: string,
  options = ACADEMIC_BINDING_OPTIONS,
) {
  return (
    options.find((option) => option.value === value) ??
    options[0] ??
    UNASSIGNED_ACADEMIC_OPTION
  );
}

export function buildAcademicBindingOptions(
  response: AcademicOptionsResponse,
): AcademicBindingOption[] {
  const organizations = new Map(response.organizations.map((item) => [item.id, item]));
  const courses = new Map(response.courses.map((item) => [item.id, item]));
  const classes = new Map(response.classes.map((item) => [item.id, item]));
  const teamOptions = response.teams
    .filter((team) => team.status === "active")
    .map((team) => {
      const classRecord = classes.get(team.classId);
      const course = classRecord ? courses.get(classRecord.courseId) : null;
      const organization = course ? organizations.get(course.organizationId) : null;
      return {
        value: team.id,
        label: [
          organization?.name,
          course?.name,
          classRecord?.name,
          team.name,
        ].filter(Boolean).join(" / "),
        organizationId: organization?.id ?? null,
        courseId: course?.id ?? null,
        classId: classRecord?.id ?? null,
        teamId: team.id,
      };
    })
    .filter((option) => option.label);
  return [UNASSIGNED_ACADEMIC_OPTION, ...teamOptions];
}
