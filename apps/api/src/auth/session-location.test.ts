// Verifies session IP location labels used by account session responses.
import test from "node:test";
import assert from "node:assert/strict";
import { resolveSessionLocation } from "./session-location.js";

test("session location labels local and private addresses without exposing the IP", () => {
  assert.deepEqual(resolveSessionLocation("127.0.0.1"), {
    locationLabel: "本机",
    region: "本机",
  });
  assert.deepEqual(resolveSessionLocation("::ffff:127.0.0.1"), {
    locationLabel: "本机",
    region: "本机",
  });
  assert.deepEqual(resolveSessionLocation("192.168.1.10"), {
    locationLabel: "内网地址",
    region: "内网地址",
  });
});

test("session location returns empty labels for invalid or missing addresses", () => {
  assert.deepEqual(resolveSessionLocation(null), {
    locationLabel: null,
    region: null,
  });
  assert.deepEqual(resolveSessionLocation("not-an-ip"), {
    locationLabel: null,
    region: null,
  });
});
