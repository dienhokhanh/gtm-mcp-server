import { z } from "zod";

// Mirrors the GTM API Parameter resource used inside tags, triggers, and variables.
export const ParameterSchema: z.ZodType<any> = z.lazy(() =>
  z
    .object({
      type: z
        .enum(["template", "boolean", "integer", "list", "map", "tagReference", "triggerReference"])
        .optional(),
      key: z.string().optional(),
      value: z.string().optional(),
      list: z.array(ParameterSchema).optional(),
      map: z.array(ParameterSchema).optional(),
    })
    .passthrough()
);

export const ConditionSchema = z.object({
  type: z.string().min(1),
  parameter: z.array(ParameterSchema).optional(),
});

const identifier = (description: string) => z.string().trim().min(1).describe(description);

export const readLocationScope = {
  account: identifier("Name or ID of the GTM account (e.g. 'My Company' or '1234567')."),
  container: identifier(
    "Name, GTM container ID (publicId, e.g. GTM-XXXX), or internal container ID."
  ),
  workspace: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Workspace name or ID. Omit only for reads to use Default Workspace."),
};

// Writes require an explicit workspace so an agent cannot silently modify the wrong one.
export const writeLocationScope = {
  account: readLocationScope.account,
  container: readLocationScope.container,
  workspace: identifier("Workspace name or ID. Required for every mutating operation."),
};

export const locationScope = readLocationScope;

const tagFields = {
  name: identifier("Display name of the tag in GTM."),
  type: identifier(
    "GTM tag type id, e.g. 'gaawe' (GA4 event), 'googtag' (Google tag), 'html' (Custom HTML), or 'awct' (Google Ads Conversion Tracking)."
  ),
  parameter: z
    .array(ParameterSchema)
    .optional()
    .describe("Parameters in the GTM API format matching the tag type."),
  firingTriggerId: z.array(z.string()).optional().describe("Trigger IDs that fire this tag."),
  blockingTriggerId: z.array(z.string()).optional().describe("Trigger IDs that block this tag."),
  tagFiringOption: z
    .enum(["tagFiringOptionUnspecified", "unlimited", "oncePerEvent", "oncePerLoad"])
    .optional(),
  paused: z.boolean().optional().describe("Whether the tag is inactive."),
  liveOnly: z.boolean().optional(),
  notes: z.string().optional(),
  parentFolderId: z.string().optional(),
  priority: ParameterSchema.optional(),
  scheduleStartMs: z.string().optional(),
  scheduleEndMs: z.string().optional(),
  setupTag: z
    .array(z.object({ tagName: z.string(), stopOnSetupFailure: z.boolean().optional() }))
    .optional(),
  teardownTag: z
    .array(z.object({ tagName: z.string(), stopTeardownOnFailure: z.boolean().optional() }))
    .optional(),
  consentSettings: z
    .object({
      consentStatus: z.enum(["notSet", "notNeeded", "needed"]).optional(),
      consentType: ParameterSchema.optional(),
    })
    .optional(),
  monitoringMetadata: ParameterSchema.optional(),
  monitoringMetadataTagNameKey: z.string().optional(),
};

export const CreateTagSchema = { ...writeLocationScope, ...tagFields };

export const UpdateTagSchema = {
  ...writeLocationScope,
  tagId: identifier("ID of the tag to update (from gtm_list_tags)."),
  name: tagFields.name.optional(),
  type: tagFields.type.optional(),
  parameter: tagFields.parameter,
  firingTriggerId: tagFields.firingTriggerId,
  blockingTriggerId: tagFields.blockingTriggerId,
  tagFiringOption: tagFields.tagFiringOption,
  paused: tagFields.paused,
  liveOnly: tagFields.liveOnly,
  notes: tagFields.notes,
  parentFolderId: tagFields.parentFolderId,
  priority: tagFields.priority,
  scheduleStartMs: tagFields.scheduleStartMs,
  scheduleEndMs: tagFields.scheduleEndMs,
  setupTag: tagFields.setupTag,
  teardownTag: tagFields.teardownTag,
  consentSettings: tagFields.consentSettings,
  monitoringMetadata: tagFields.monitoringMetadata,
  monitoringMetadataTagNameKey: tagFields.monitoringMetadataTagNameKey,
};

const triggerFields = {
  name: identifier("Display name of the trigger."),
  type: identifier(
    "GTM trigger type, e.g. 'pageview', 'domReady', 'click', 'linkClick', 'customEvent', or 'timer'."
  ),
  customEventFilter: z.array(ConditionSchema).optional(),
  filter: z.array(ConditionSchema).optional().describe("Filter conditions in GTM API format."),
  autoEventFilter: z.array(ConditionSchema).optional(),
  parameter: z.array(ParameterSchema).optional(),
  waitForTags: ParameterSchema.optional(),
  checkValidation: ParameterSchema.optional(),
  waitForTagsTimeout: ParameterSchema.optional(),
  uniqueTriggerId: ParameterSchema.optional(),
  eventName: ParameterSchema.optional(),
  interval: ParameterSchema.optional(),
  intervalSeconds: ParameterSchema.optional(),
  limit: ParameterSchema.optional(),
  maxTimerLengthSeconds: ParameterSchema.optional(),
  selector: ParameterSchema.optional(),
  horizontalScrollPercentageList: ParameterSchema.optional(),
  verticalScrollPercentageList: ParameterSchema.optional(),
  visibilitySelector: ParameterSchema.optional(),
  visiblePercentageMin: ParameterSchema.optional(),
  visiblePercentageMax: ParameterSchema.optional(),
  continuousTimeMinMilliseconds: ParameterSchema.optional(),
  totalTimeMinMilliseconds: ParameterSchema.optional(),
  notes: z.string().optional(),
  parentFolderId: z.string().optional(),
};

export const CreateTriggerSchema = { ...writeLocationScope, ...triggerFields };

export const UpdateTriggerSchema = {
  ...writeLocationScope,
  triggerId: identifier("ID of the trigger to update (from gtm_list_triggers)."),
  name: triggerFields.name.optional(),
  type: triggerFields.type.optional(),
  customEventFilter: triggerFields.customEventFilter,
  filter: triggerFields.filter,
  autoEventFilter: triggerFields.autoEventFilter,
  parameter: triggerFields.parameter,
  waitForTags: triggerFields.waitForTags,
  checkValidation: triggerFields.checkValidation,
  waitForTagsTimeout: triggerFields.waitForTagsTimeout,
  uniqueTriggerId: triggerFields.uniqueTriggerId,
  eventName: triggerFields.eventName,
  interval: triggerFields.interval,
  intervalSeconds: triggerFields.intervalSeconds,
  limit: triggerFields.limit,
  maxTimerLengthSeconds: triggerFields.maxTimerLengthSeconds,
  selector: triggerFields.selector,
  horizontalScrollPercentageList: triggerFields.horizontalScrollPercentageList,
  verticalScrollPercentageList: triggerFields.verticalScrollPercentageList,
  visibilitySelector: triggerFields.visibilitySelector,
  visiblePercentageMin: triggerFields.visiblePercentageMin,
  visiblePercentageMax: triggerFields.visiblePercentageMax,
  continuousTimeMinMilliseconds: triggerFields.continuousTimeMinMilliseconds,
  totalTimeMinMilliseconds: triggerFields.totalTimeMinMilliseconds,
  notes: triggerFields.notes,
  parentFolderId: triggerFields.parentFolderId,
};

const variableFields = {
  name: identifier("Display name of the variable."),
  type: identifier(
    "GTM variable type, e.g. 'v' (Data Layer), 'c' (Constant), or 'jsm' (Custom JavaScript)."
  ),
  parameter: z.array(ParameterSchema).optional(),
  notes: z.string().optional(),
  parentFolderId: z.string().optional(),
  enablingTriggerId: z.array(z.string()).optional(),
  disablingTriggerId: z.array(z.string()).optional(),
  formatValue: z
    .object({
      caseConversionType: z.string().optional(),
      convertFalseToValue: ParameterSchema.optional(),
      convertNullToValue: ParameterSchema.optional(),
      convertTrueToValue: ParameterSchema.optional(),
      convertUndefinedToValue: ParameterSchema.optional(),
    })
    .optional(),
};

export const CreateVariableSchema = { ...writeLocationScope, ...variableFields };

export const UpdateVariableSchema = {
  ...writeLocationScope,
  variableId: identifier("ID of the variable to update (from gtm_list_variables)."),
  name: variableFields.name.optional(),
  type: variableFields.type.optional(),
  parameter: variableFields.parameter,
  notes: variableFields.notes,
  parentFolderId: variableFields.parentFolderId,
  enablingTriggerId: variableFields.enablingTriggerId,
  disablingTriggerId: variableFields.disablingTriggerId,
  formatValue: variableFields.formatValue,
};
