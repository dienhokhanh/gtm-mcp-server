import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import {
  CreateTagSchema,
  CreateTriggerSchema,
  UpdateTagSchema,
  writeLocationScope,
} from "../src/schemas.js";

const base = { account: "123", container: "GTM-TEST", workspace: "Automation" };

test("mutating operations require an explicit workspace", () => {
  const schema = z.object(writeLocationScope);
  assert.equal(schema.safeParse(base).success, true);
  assert.equal(schema.safeParse({ account: "123", container: "GTM-TEST" }).success, false);
  assert.equal(schema.safeParse({ ...base, workspace: " " }).success, false);
});

test("tag firing options use the GTM API wire values", () => {
  const createTag = z.object(CreateTagSchema);
  assert.equal(
    createTag.safeParse({ ...base, name: "GA4 event", type: "gaawe", tagFiringOption: "oncePerEvent" })
      .success,
    true
  );
  assert.equal(
    createTag.safeParse({ ...base, name: "GA4 event", type: "gaawe", tagFiringOption: "ONCE_PER_EVENT" })
      .success,
    false
  );
});

test("tag updates may contain only the fields being changed", () => {
  const updateTag = z.object(UpdateTagSchema);
  assert.equal(updateTag.safeParse({ ...base, tagId: "42", paused: true }).success, true);
});

test("trigger filters use GTM Condition objects", () => {
  const createTrigger = z.object(CreateTriggerSchema);
  const result = createTrigger.safeParse({
    ...base,
    name: "Purchase",
    type: "customEvent",
    customEventFilter: [
      {
        type: "equals",
        parameter: [
          { type: "template", key: "arg0", value: "{{_event}}" },
          { type: "template", key: "arg1", value: "purchase" },
        ],
      },
    ],
  });
  assert.equal(result.success, true);
});
