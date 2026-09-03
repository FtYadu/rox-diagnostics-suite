/**
 * Zod schemas for `data/canonical/*.json` — the machine-readable contract between the
 * legacy globatROX extraction scripts and this repo's generators.
 *
 * Rules encoded here:
 *  - addresses, DIDs, RIDs and DTC codes are numbers (hex only in generated output)
 *  - session + security requirements travel with the data
 *  - process steps are a discriminated union so they stay executable
 */
import { z } from "zod";

/* ------------------------------------------------------------------ primitives */

export const busSchema = z.enum(["DoIP", "CAN", "CANFD"]);
export type Bus = z.infer<typeof busSchema>;

export const valueTypeSchema = z.enum(["uint", "int", "ascii", "hex", "bitfield", "enum", "float"]);
export type ValueType = z.infer<typeof valueTypeSchema>;

export const sessionSchema = z.union([z.literal(1), z.literal(3)]);
export type DiagnosticSession = z.infer<typeof sessionSchema>;

const enumMapSchema = z.record(z.string(), z.string());

const scaling = {
  factor: z.number().optional(),
  offset: z.number().optional(),
  signed: z.boolean().optional(),
  enum: enumMapSchema.optional(),
};

/** One field inside a multi-byte record (snapshot layout, routine or IO-control params). */
export const signalLayoutSchema = z.object({
  name: z.string().min(1),
  byteStart: z.number().int().nonnegative(),
  bitStart: z.number().int().min(0).max(7).optional(),
  length: z.number().int().positive(),
  type: valueTypeSchema,
  unit: z.string().optional(),
  ...scaling,
});
export type SignalLayout = z.infer<typeof signalLayoutSchema>;

/* ------------------------------------------------------------------ did / routine / io */

export const didSchema = z.object({
  did: z.number().int().min(0).max(0xffff),
  label: z.string().min(1),
  unit: z.string().optional(),
  length: z.number().int().positive(),
  type: valueTypeSchema,
  min: z.number().optional(),
  max: z.number().optional(),
  session: sessionSchema.optional(),
  saLevel: z.number().int().nonnegative().optional(),
  ...scaling,
});
export type Did = z.infer<typeof didSchema>;

export const routineSubFunctionSchema = z.enum(["start", "stop", "status"]);

export const routineSchema = z.object({
  rid: z.number().int().min(0).max(0xffff),
  name: z.string().min(1),
  subFunctions: z.array(routineSubFunctionSchema).min(1),
  params: z.array(signalLayoutSchema).optional(),
  session: sessionSchema.optional(),
  saLevel: z.number().int().nonnegative().optional(),
});
export type Routine = z.infer<typeof routineSchema>;

export const ioControlOptionSchema = z.enum([
  "returnControl",
  "resetToDefault",
  "freeze",
  "shortTermAdjust",
]);

export const ioControlSchema = z.object({
  did: z.number().int().min(0).max(0xffff),
  label: z.string().min(1),
  options: z.array(ioControlOptionSchema).min(1),
  params: z.array(signalLayoutSchema).optional(),
  saLevel: z.number().int().nonnegative().optional(),
});
export type IoControl = z.infer<typeof ioControlSchema>;

/* ------------------------------------------------------------------ dtc */

export const dtcSchema = z.object({
  /** 3-byte numeric DTC, e.g. 0x911716. */
  code: z.number().int().min(0).max(0xffffff),
  /** Dealer-facing text form, e.g. "B111716". */
  codeText: z.string().regex(/^[PCBU][0-9A-F]{6}$/i),
  name: z.string().min(1),
  severity: z.number().int().min(1).max(3),
  statusMask: z.number().int().min(0).max(0xff).optional(),
});
export type Dtc = z.infer<typeof dtcSchema>;

/* ------------------------------------------------------------------ ecu */

export const ecuSchema = z.object({
  id: z.string().min(1),
  fullName: z.string().min(1),
  /** Legacy globatROX grouping; the UI domain is derived from this. */
  subSystem: z.string().min(1).optional(),
  domain: z.string().min(1),
  bus: busSchema,
  address: z.number().int().min(0).max(0xffff),
  secondaryAddresses: z.array(z.number().int().min(0).max(0xffff)).default([]),
  saLevels: z.array(z.number().int().nonnegative()).default([]),
  identDids: z.array(didSchema).default([]),
  liveDids: z.array(didSchema).default([]),
  writeDids: z.array(didSchema).default([]),
  ioControls: z.array(ioControlSchema).default([]),
  routines: z.array(routineSchema).default([]),
  dtcs: z.array(dtcSchema).default([]),
  snapshotLayout: z.array(signalLayoutSchema).default([]),
  dtcStatusMask: z.number().int().min(0).max(0xff).optional(),
});
export type Ecu = z.infer<typeof ecuSchema>;

/* ------------------------------------------------------------------ process steps */

const stepBase = { id: z.string().min(1).optional(), label: z.string().optional() };

export const requestFieldSchema = z.object({
  name: z.string().min(1),
  /** Literal hex bytes, or a variable reference resolved at runtime. */
  value: z.union([z.string(), z.number()]).optional(),
  variable: z.string().optional(),
  length: z.number().int().positive().optional(),
});

export const ecuServiceStepSchema = z.object({
  kind: z.literal("ecuService"),
  ...stepBase,
  ecuId: z.string().min(1),
  sid: z.number().int().min(0).max(0xff),
  subFunction: z.number().int().min(0).max(0xff).optional(),
  request: z.array(requestFieldSchema).default([]),
  responseLayout: z.array(signalLayoutSchema).optional(),
  /** Step id / label to jump to when the ECU answers with a negative response. */
  negativeExit: z.string().optional(),
  session: sessionSchema.optional(),
  saLevel: z.number().int().nonnegative().optional(),
  storeAs: z.string().optional(),
});
export type EcuServiceStep = z.infer<typeof ecuServiceStepSchema>;

export const outputStepSchema = z.object({
  kind: z.literal("output"),
  ...stepBase,
  level: z.enum(["information", "warning", "error"]),
  text: z.string().min(1),
});
export type OutputStep = z.infer<typeof outputStepSchema>;

export const inputStepSchema = z.object({
  kind: z.literal("input"),
  ...stepBase,
  prompt: z.string().min(1),
  inputType: z.enum(["text", "number", "choice", "vin", "confirm"]),
  variable: z.string().min(1),
  options: z.array(z.string()).optional(),
  unit: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});
export type InputStep = z.infer<typeof inputStepSchema>;

export const delayStepSchema = z.object({
  kind: z.literal("delay"),
  ...stepBase,
  ms: z.number().int().positive(),
});
export type DelayStep = z.infer<typeof delayStepSchema>;

export const setVarStepSchema = z.object({
  kind: z.literal("setVar"),
  ...stepBase,
  variable: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean()]),
});
export type SetVarStep = z.infer<typeof setVarStepSchema>;

export const conditionSchema = z.object({
  left: z.string().min(1),
  comparator: z.enum(["eq", "neq", "lt", "lte", "gt", "gte", "contains"]),
  right: z.union([z.string(), z.number(), z.boolean()]),
});
export type Condition = z.infer<typeof conditionSchema>;

export type IfStep = {
  kind: "if";
  id?: string | undefined;
  label?: string | undefined;
  condition: Condition;
  then: ProcessStep[];
  else?: ProcessStep[] | undefined;
};

export type ProcessStep = EcuServiceStep | OutputStep | InputStep | IfStep | DelayStep | SetVarStep;

export const ifStepSchema: z.ZodType<IfStep> = z.lazy(() =>
  z.object({
    kind: z.literal("if"),
    ...stepBase,
    condition: conditionSchema,
    then: z.array(processStepSchema),
    else: z.array(processStepSchema).optional(),
  }),
);

export const processStepSchema: z.ZodType<ProcessStep> = z.lazy(() =>
  z
    .discriminatedUnion("kind", [
      ecuServiceStepSchema,
      outputStepSchema,
      inputStepSchema,
      delayStepSchema,
      setVarStepSchema,
    ])
    .or(ifStepSchema),
) as z.ZodType<ProcessStep>;

export const processCategorySchema = z.enum([
  "Reset",
  "Coding",
  "Immobiliser",
  "Calibration",
  "Actuator test",
  "Service",
]);

export const serviceProcessSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  ecu: z.string().min(1),
  category: processCategorySchema,
  udsServices: z.array(z.string()).default([]),
  securityLevel: z.number().int().nonnegative().default(0),
  requiresVin: z.boolean().optional(),
  steps: z.array(processStepSchema).default([]),
});
export type ServiceProcess = z.infer<typeof serviceProcessSchema>;

/* ------------------------------------------------------------------ flows / menu */

export const programmingFlowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  ecus: z.array(z.string()).default([]),
  phases: z.array(z.string()).default([]),
});
export type ProgrammingFlow = z.infer<typeof programmingFlowSchema>;

export type MenuNode = {
  id: string;
  label: string;
  ecuId?: string | undefined;
  processId?: string | undefined;
  children?: MenuNode[] | undefined;
};

export const menuNodeSchema: z.ZodType<MenuNode> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    ecuId: z.string().optional(),
    processId: z.string().optional(),
    children: z.array(menuNodeSchema).optional(),
  }),
);

/* ------------------------------------------------------------------ files */

export const vehicleMetaSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  vinExample: z.string().optional(),
  bus: z.string().optional(),
});

export const ecusFileSchema = z.object({
  vehicle: vehicleMetaSchema,
  ecus: z.array(ecuSchema).min(1),
});
export type EcusFile = z.infer<typeof ecusFileSchema>;

export const addressesFileSchema = z.object({
  testerAddress: z.number().int().min(0).max(0xffff),
  functionalAddress: z.number().int().min(0).max(0xffff),
  ecus: z.array(
    z.object({
      id: z.string().min(1),
      bus: busSchema,
      address: z.number().int().min(0).max(0xffff),
      secondaryAddresses: z.array(z.number().int().min(0).max(0xffff)).default([]),
    }),
  ),
});
export type AddressesFile = z.infer<typeof addressesFileSchema>;

export const servicesFileSchema = z.object({
  ecus: z.array(
    z.object({
      id: z.string().min(1),
      services: z.array(
        z.object({
          sid: z.number().int().min(0).max(0xff),
          name: z.string().min(1),
          subFunctions: z.array(z.number().int().min(0).max(0xff)).default([]),
          session: sessionSchema.optional(),
          saLevel: z.number().int().nonnegative().optional(),
        }),
      ),
    }),
  ),
});
export type ServicesFile = z.infer<typeof servicesFileSchema>;

export const didsFileSchema = z.object({
  ecus: z.array(
    z.object({
      id: z.string().min(1),
      /** readDataByIdentifier (0x22). */
      rdbi: z.array(didSchema).default([]),
      /** dynamicallyDefineDataIdentifier / periodic read sources (0x2C / 0x2A). */
      drdbi: z.array(didSchema).default([]),
      /** writeDataByIdentifier (0x2E). */
      wdbi: z.array(didSchema).default([]),
      snapshotLayout: z.array(signalLayoutSchema).default([]),
    }),
  ),
});
export type DidsFile = z.infer<typeof didsFileSchema>;

export const dtcsFileSchema = z.object({
  ecus: z.array(
    z.object({
      id: z.string().min(1),
      statusMask: z.number().int().min(0).max(0xff).optional(),
      dtcs: z.array(dtcSchema).default([]),
    }),
  ),
});
export type DtcsFile = z.infer<typeof dtcsFileSchema>;

export const routinesFileSchema = z.object({
  ecus: z.array(z.object({ id: z.string().min(1), routines: z.array(routineSchema).default([]) })),
});
export type RoutinesFile = z.infer<typeof routinesFileSchema>;

export const ioControlFileSchema = z.object({
  ecus: z.array(
    z.object({ id: z.string().min(1), ioControls: z.array(ioControlSchema).default([]) }),
  ),
});
export type IoControlFile = z.infer<typeof ioControlFileSchema>;

export const processesFileSchema = z.object({
  processes: z.array(serviceProcessSchema),
});
export type ProcessesFile = z.infer<typeof processesFileSchema>;

export const flowsFileSchema = z.object({
  flows: z.array(programmingFlowSchema),
});
export type FlowsFile = z.infer<typeof flowsFileSchema>;

export const menuFileSchema = z.object({
  root: z.array(menuNodeSchema),
});
export type MenuFile = z.infer<typeof menuFileSchema>;

/** file name -> schema, used by the generators to validate the whole set at once. */
export const CANONICAL_FILES = {
  "ecus.json": ecusFileSchema,
  "addresses.json": addressesFileSchema,
  "services.json": servicesFileSchema,
  "dids.json": didsFileSchema,
  "dtcs.json": dtcsFileSchema,
  "routines.json": routinesFileSchema,
  "iocontrol.json": ioControlFileSchema,
  "processes.json": processesFileSchema,
  "flows.json": flowsFileSchema,
  "menu.json": menuFileSchema,
} as const;

export type CanonicalFileName = keyof typeof CANONICAL_FILES;

/** Counts asserted by the generators; a drift means the extraction changed. */
export const EXPECTED_COUNTS = {
  ecus: 42,
  rdbiDids: 589,
  drdbiDids: 1056,
  wdbiDids: 81,
  ioControls: 113,
  routines: 148,
  processes: 131,
} as const;
