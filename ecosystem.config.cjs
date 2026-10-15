const releaseEnv = {
  ...(process.env.UML_RELEASE_SHA
    ? { UML_RELEASE_SHA: process.env.UML_RELEASE_SHA }
    : {}),
  ...(process.env.UML_RELEASE_DIR
    ? { UML_RELEASE_DIR: process.env.UML_RELEASE_DIR }
    : {}),
  ...(process.env.UML_RELEASE_STARTED_AT
    ? { UML_RELEASE_STARTED_AT: process.env.UML_RELEASE_STARTED_AT }
    : {}),
};

const corsEnv = {
  ...(process.env.API_CORS_ORIGINS
    ? { API_CORS_ORIGINS: process.env.API_CORS_ORIGINS }
    : {}),
  ...(process.env.RENDER_SERVICE_CORS_ORIGINS
    ? { RENDER_SERVICE_CORS_ORIGINS: process.env.RENDER_SERVICE_CORS_ORIGINS }
    : {}),
};

const documentEnv = {
  ...(process.env.ONLYOFFICE_DOCUMENT_SERVER_URL
    ? { ONLYOFFICE_DOCUMENT_SERVER_URL: process.env.ONLYOFFICE_DOCUMENT_SERVER_URL }
    : {}),
  ...(process.env.PUBLIC_API_BASE_URL
    ? { PUBLIC_API_BASE_URL: process.env.PUBLIC_API_BASE_URL }
    : {}),
  ...(process.env.PUBLIC_WEB_BASE_URL
    ? { PUBLIC_WEB_BASE_URL: process.env.PUBLIC_WEB_BASE_URL }
    : {}),
  ...(process.env.ONLYOFFICE_JWT_SECRET
    ? { ONLYOFFICE_JWT_SECRET: process.env.ONLYOFFICE_JWT_SECRET }
    : {}),
  ...(process.env.ONLYOFFICE_ACCESS_TOKEN_SECRET
    ? { ONLYOFFICE_ACCESS_TOKEN_SECRET: process.env.ONLYOFFICE_ACCESS_TOKEN_SECRET }
    : {}),
  ...(process.env.UML_DOCUMENT_STORAGE_DIR
    ? { UML_DOCUMENT_STORAGE_DIR: process.env.UML_DOCUMENT_STORAGE_DIR }
    : {}),
  ...(process.env.UML_AVATAR_STORAGE_DIR
    ? { UML_AVATAR_STORAGE_DIR: process.env.UML_AVATAR_STORAGE_DIR }
    : {}),
};

const providerEnv = {
  ...(process.env.UML_PROVIDER_CONFIG_SECRET
    ? { UML_PROVIDER_CONFIG_SECRET: process.env.UML_PROVIDER_CONFIG_SECRET }
    : {}),
  ...(process.env.UML_PROVIDER_SECRET_KEY
    ? { UML_PROVIDER_SECRET_KEY: process.env.UML_PROVIDER_SECRET_KEY }
    : {}),
  ...(process.env.UML_PROVIDER_HOURLY_LIMIT
    ? { UML_PROVIDER_HOURLY_LIMIT: process.env.UML_PROVIDER_HOURLY_LIMIT }
    : {}),
  ...(process.env.UML_ALLOW_LEGACY_PROVIDER_TEST
    ? { UML_ALLOW_LEGACY_PROVIDER_TEST: process.env.UML_ALLOW_LEGACY_PROVIDER_TEST }
    : {}),
  ...(process.env.UML_ALLOW_PROJECT_LEGACY_PROVIDER_SETTINGS
    ? {
        UML_ALLOW_PROJECT_LEGACY_PROVIDER_SETTINGS:
          process.env.UML_ALLOW_PROJECT_LEGACY_PROVIDER_SETTINGS,
      }
    : {}),
  ...(process.env.UML_TRACE_RAW_OUTPUT_MAX_CHARS
    ? { UML_TRACE_RAW_OUTPUT_MAX_CHARS: process.env.UML_TRACE_RAW_OUTPUT_MAX_CHARS }
    : {}),
  ...(process.env.UML_PERSIST_PROGRESS_SNAPSHOT
    ? { UML_PERSIST_PROGRESS_SNAPSHOT: process.env.UML_PERSIST_PROGRESS_SNAPSHOT }
    : {}),
};

const queueEnv = {
  ...(process.env.REDIS_URL ? { REDIS_URL: process.env.REDIS_URL } : {}),
  ...(process.env.UML_RUN_QUEUE_MODE
    ? { UML_RUN_QUEUE_MODE: process.env.UML_RUN_QUEUE_MODE }
    : {}),
  ...(process.env.UML_RUN_QUEUE_NAME
    ? { UML_RUN_QUEUE_NAME: process.env.UML_RUN_QUEUE_NAME }
    : {}),
  ...(process.env.UML_GENERATION_WORKER_CONCURRENCY
    ? {
        UML_GENERATION_WORKER_CONCURRENCY:
          process.env.UML_GENERATION_WORKER_CONCURRENCY,
      }
    : {}),
  ...(process.env.DATABASE_POOL_MAX
    ? { DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX }
    : {}),
  ...(process.env.UML_LLM_GLOBAL_CONCURRENCY
    ? { UML_LLM_GLOBAL_CONCURRENCY: process.env.UML_LLM_GLOBAL_CONCURRENCY }
    : {}),
  ...(process.env.UML_LLM_PROVIDER_CONCURRENCY
    ? { UML_LLM_PROVIDER_CONCURRENCY: process.env.UML_LLM_PROVIDER_CONCURRENCY }
    : {}),
  ...(process.env.UML_LLM_PROJECT_CONCURRENCY
    ? { UML_LLM_PROJECT_CONCURRENCY: process.env.UML_LLM_PROJECT_CONCURRENCY }
    : {}),
  ...(process.env.UML_LLM_USER_CONCURRENCY
    ? { UML_LLM_USER_CONCURRENCY: process.env.UML_LLM_USER_CONCURRENCY }
    : {}),
  ...(process.env.UML_LLM_RUN_CONCURRENCY
    ? { UML_LLM_RUN_CONCURRENCY: process.env.UML_LLM_RUN_CONCURRENCY }
    : {}),
};

const modelTaskTimeoutEnv = {
  ...(process.env.UML_REQUIREMENT_MODEL_TASK_TIMEOUT_MS
    ? {
        UML_REQUIREMENT_MODEL_TASK_TIMEOUT_MS:
          process.env.UML_REQUIREMENT_MODEL_TASK_TIMEOUT_MS,
      }
    : {}),
  ...(process.env.UML_REQUIREMENT_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS
    ? {
        UML_REQUIREMENT_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS:
          process.env.UML_REQUIREMENT_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS,
      }
    : {}),
  ...(process.env.UML_REQUIREMENT_MODEL_TASK_MAX_RUNTIME_MS
    ? {
        UML_REQUIREMENT_MODEL_TASK_MAX_RUNTIME_MS:
          process.env.UML_REQUIREMENT_MODEL_TASK_MAX_RUNTIME_MS,
      }
    : {}),
  ...(process.env.UML_DESIGN_MODEL_TASK_TIMEOUT_MS
    ? {
        UML_DESIGN_MODEL_TASK_TIMEOUT_MS:
          process.env.UML_DESIGN_MODEL_TASK_TIMEOUT_MS,
      }
    : {}),
  ...(process.env.UML_DESIGN_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS
    ? {
        UML_DESIGN_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS:
          process.env.UML_DESIGN_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS,
      }
    : {}),
  ...(process.env.UML_DESIGN_MODEL_TASK_MAX_RUNTIME_MS
    ? {
        UML_DESIGN_MODEL_TASK_MAX_RUNTIME_MS:
          process.env.UML_DESIGN_MODEL_TASK_MAX_RUNTIME_MS,
      }
    : {}),
  ...(process.env.UML_CODE_MODEL_TASK_TIMEOUT_MS
    ? { UML_CODE_MODEL_TASK_TIMEOUT_MS: process.env.UML_CODE_MODEL_TASK_TIMEOUT_MS }
    : {}),
  ...(process.env.UML_CODE_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS
    ? {
        UML_CODE_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS:
          process.env.UML_CODE_MODEL_TASK_BLANK_OUTPUT_TIMEOUT_MS,
      }
    : {}),
  ...(process.env.UML_CODE_MODEL_TASK_MAX_RUNTIME_MS
    ? {
        UML_CODE_MODEL_TASK_MAX_RUNTIME_MS:
          process.env.UML_CODE_MODEL_TASK_MAX_RUNTIME_MS,
      }
    : {}),
};


const renderServiceEnv = {
  NODE_ENV: "production",
  RENDER_SERVICE_HOST: "127.0.0.1",
  RENDER_SERVICE_PORT: "4002",
  ...(process.env.UML_PDF_FONT_REGULAR ? { UML_PDF_FONT_REGULAR: process.env.UML_PDF_FONT_REGULAR } : {}),
  ...(process.env.UML_PDF_FONT_BOLD ? { UML_PDF_FONT_BOLD: process.env.UML_PDF_FONT_BOLD } : {}),
  ...(process.env.UML_RENDER_CONCURRENCY
    ? { UML_RENDER_CONCURRENCY: process.env.UML_RENDER_CONCURRENCY }
    : {}),
  ...releaseEnv,
  ...corsEnv,
};

const apiEnv = {
  NODE_ENV: "production",
  API_HOST: "127.0.0.1",
  API_PORT: "4001",
  UML_API_AUTOSTART: "true",
  RENDER_SERVICE_BASE_URL: "http://127.0.0.1:4002",
  ...releaseEnv,
  ...corsEnv,
  ...documentEnv,
  ...providerEnv,
  ...queueEnv,
  ...modelTaskTimeoutEnv,
};

const workerEnv = {
  NODE_ENV: "production",
  RENDER_SERVICE_BASE_URL: "http://127.0.0.1:4002",
  ...releaseEnv,
  ...documentEnv,
  ...providerEnv,
  ...queueEnv,
  ...modelTaskTimeoutEnv,
};

const apiInstances = Number.parseInt(process.env.UML_API_INSTANCES ?? "1", 10);
const workerInstances = Number.parseInt(
  process.env.UML_GENERATION_WORKER_INSTANCES ?? "1",
  10,
);
const apiMaxMemoryRestart = process.env.UML_API_MAX_MEMORY_RESTART ?? "1536M";
const workerMaxMemoryRestart =
  process.env.UML_GENERATION_WORKER_MAX_MEMORY_RESTART ?? "1536M";
const resolvedApiInstances =
  Number.isInteger(apiInstances) && apiInstances > 0 ? apiInstances : 1;

module.exports = {
  apps: [
    {
      name: "uml-web",
      cwd: __dirname,
      script: "apps/web/.next/standalone/apps/web/server.js",
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: "4003", UML_API_ORIGIN: "http://127.0.0.1:4001", ...releaseEnv },
      env_production: { NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: "4003", UML_API_ORIGIN: "http://127.0.0.1:4001", ...releaseEnv },
      max_memory_restart: "1024M",
      time: true,
    },
    {
      name: "uml-render-service",
      cwd: __dirname,
      script: "bash",
      args: [
        "-lc",
        "cd \"$PWD\" && RENDER_SERVICE_HOST=127.0.0.1 RENDER_SERVICE_PORT=4002 node apps/render-service/dist/index.js",
      ],
      instances: 1,
      exec_mode: "fork",
      env: renderServiceEnv,
      env_production: renderServiceEnv,
      max_memory_restart: "512M",
      time: true,
    },
    {
      name: "uml-api",
      cwd: __dirname,
      script: "apps/api/dist/index.js",
      instances: resolvedApiInstances,
      exec_mode: resolvedApiInstances > 1 ? "cluster" : "fork",
      env: apiEnv,
      env_production: apiEnv,
      max_memory_restart: apiMaxMemoryRestart,
      time: true,
    },
    ...(process.env.UML_ENABLE_GENERATION_WORKER === "true"
      ? [
          {
            name: "uml-generation-worker",
            cwd: __dirname,
            script: "bash",
            args: [
              "-lc",
              "cd \"$PWD\" && node apps/api/dist/workers/generation-worker.js",
            ],
            instances:
              Number.isInteger(workerInstances) && workerInstances > 0
                ? workerInstances
                : 1,
            exec_mode: "fork",
            env: workerEnv,
            env_production: workerEnv,
            max_memory_restart: workerMaxMemoryRestart,
            time: true,
          },
        ]
      : []),
  ],
};
