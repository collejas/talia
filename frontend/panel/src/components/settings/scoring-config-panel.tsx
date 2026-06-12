"use client";

import { Fragment, useMemo, useState, useTransition } from "react";

import { Bar, BarChart, Cell, CartesianGrid, LabelList, ReferenceLine, XAxis, YAxis } from "recharts";

import {
  deleteScoringQuestion,
  deleteScoringReprompt,
  deleteScoringRule,
  fetchScoringConfig,
  seedScoringDefaults,
  type ScoringChannel,
  type ScoringConfigBundle,
  type ScoringProfile,
  upsertScoringProfile,
  upsertScoringQuestion,
  upsertScoringReprompt,
  upsertScoringRule,
} from "@/app/settings/scoring/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ChartContainer } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const WEIGHT_KEYS = [
  "capacidad_financiera",
  "urgencia",
  "nivel_decision",
  "autoridad",
  "interaccion_compromiso",
] as const;

const WEIGHT_LABELS: Record<(typeof WEIGHT_KEYS)[number], string> = {
  capacidad_financiera: "Capacidad financiera",
  urgencia: "Urgencia",
  nivel_decision: "Nivel de decisión",
  autoridad: "Autoridad",
  interaccion_compromiso: "Interacción y compromiso",
};

const WEIGHT_COLORS: Record<WeightKey, string> = {
  capacidad_financiera: "hsl(216 92% 52%)",
  urgencia: "hsl(25 95% 53%)",
  nivel_decision: "hsl(262 83% 58%)",
  autoridad: "hsl(142 71% 45%)",
  interaccion_compromiso: "hsl(346 87% 52%)",
};

const WEIGHT_CHART_CONFIG = {
  capacidad_financiera: {
    label: WEIGHT_LABELS.capacidad_financiera,
    color: WEIGHT_COLORS.capacidad_financiera,
  },
  urgencia: {
    label: WEIGHT_LABELS.urgencia,
    color: WEIGHT_COLORS.urgencia,
  },
  nivel_decision: {
    label: WEIGHT_LABELS.nivel_decision,
    color: WEIGHT_COLORS.nivel_decision,
  },
  autoridad: {
    label: WEIGHT_LABELS.autoridad,
    color: WEIGHT_COLORS.autoridad,
  },
  interaccion_compromiso: {
    label: WEIGHT_LABELS.interaccion_compromiso,
    color: WEIGHT_COLORS.interaccion_compromiso,
  },
} as const;

const FIELD_KEY_PRESETS = [
  { key: "financing_type", label: "Forma de compra (contado / crédito / mixto)" },
  { key: "budget_range", label: "Rango de presupuesto" },
  { key: "purchase_timeline", label: "Plazo de compra" },
  { key: "decision_authority", label: "Quién decide la compra" },
  { key: "credit_preapproved", label: "Preaprobación de crédito" },
  { key: "visited_properties", label: "Ya visitó propiedades" },
  { key: "down_payment_ready", label: "Enganche disponible" },
  { key: "hard_deadline", label: "Fecha límite de compra" },
  { key: "comparison_mode", label: "Modo de comparación" },
  { key: "requirements_defined", label: "Requisitos definidos" },
  { key: "buyer_type", label: "Tipo de comprador (individual/empresa/inversionista)" },
] as const;

type FieldKey = (typeof FIELD_KEY_PRESETS)[number]["key"];
const FIELD_KEY_LABEL_BY_KEY = new Map<FieldKey, string>(
  FIELD_KEY_PRESETS.map((item) => [item.key, item.label]),
);

function resolveFieldLabel(fieldKey: string | null | undefined) {
  if (!fieldKey) return undefined;
  const normalized = fieldKey.trim() as FieldKey;
  return FIELD_KEY_LABEL_BY_KEY.get(normalized);
}

const CUSTOM_FIELD_KEY = "__custom__";

type WeightKey = (typeof WEIGHT_KEYS)[number];
type QuestionFactor = WeightKey;

type WeightForm = Record<WeightKey, string>;

const QUESTION_FACTOR_LABELS: Record<QuestionFactor, string> = {
  capacidad_financiera: WEIGHT_LABELS.capacidad_financiera,
  urgencia: WEIGHT_LABELS.urgencia,
  nivel_decision: WEIGHT_LABELS.nivel_decision,
  autoridad: WEIGHT_LABELS.autoridad,
  interaccion_compromiso: WEIGHT_LABELS.interaccion_compromiso,
};

const QUESTION_FACTOR_HELP: Record<QuestionFactor, string> = {
  capacidad_financiera: "Se usa para entender si puede comprar y bajo qué modalidad.",
  urgencia: "Agrupa señales de tiempo, plazo y presión de compra.",
  nivel_decision: "Ordena preguntas que muestran nivel de avance y claridad.",
  autoridad: "Ayuda a saber quién decide y quién influye en la compra.",
  interaccion_compromiso: "Mide apertura, seguimiento y disposición a avanzar.",
};

const QUESTION_FACTOR_ORDER: QuestionFactor[] = [
  "capacidad_financiera",
  "urgencia",
  "nivel_decision",
  "autoridad",
  "interaccion_compromiso",
];

function resolveQuestionFactorColor(factor: QuestionFactor): string {
  return WEIGHT_COLORS[factor];
}

const QUESTION_FACTOR_BY_FIELD_KEY: Partial<Record<string, WeightKey>> = {
  financing_type: "capacidad_financiera",
  credit_preapproved: "capacidad_financiera",
  budget_range: "capacidad_financiera",
  down_payment_ready: "capacidad_financiera",
  purchase_timeline: "urgencia",
  hard_deadline: "urgencia",
  requirements_defined: "nivel_decision",
  comparison_mode: "nivel_decision",
  visited_properties: "nivel_decision",
  decision_authority: "autoridad",
  buyer_type: "autoridad",
};

type ThresholdForm = {
  explorando_max: string;
  interesado_max: string;
  listo_min: string;
};

type ConfidenceForm = {
  medium_min: string;
  high_min: string;
};

type QuestionLike = {
  field_key: string;
  metadata?: Record<string, unknown>;
};

type QuestionTypeOption = {
  value: string;
  label: string;
};

const QUESTION_TYPE_LABELS: Record<string, string> = {
  single_choice: "Opción única",
  multi_choice: "Opción múltiple",
  number: "Número",
  text: "Texto",
  boolean: "Sí / No",
  range: "Rango",
};

const QUESTION_TYPE_OPTIONS: QuestionTypeOption[] = [
  { value: "single_choice", label: QUESTION_TYPE_LABELS.single_choice },
  { value: "multi_choice", label: QUESTION_TYPE_LABELS.multi_choice },
  { value: "number", label: QUESTION_TYPE_LABELS.number },
  { value: "text", label: QUESTION_TYPE_LABELS.text },
  { value: "boolean", label: QUESTION_TYPE_LABELS.boolean },
  { value: "range", label: QUESTION_TYPE_LABELS.range },
];

const RULE_VALUE_PRESETS_BY_FIELD_KEY: Partial<Record<string, readonly string[]>> = {
  financing_type: ["contado", "mixto", "credito", "unknown", "refused"],
  purchase_timeline: ["<3m", "3-6m", "6-12m", ">12m", "unknown", "refused"],
  decision_authority: ["full", "shared", "advisor", "unknown", "refused"],
  credit_preapproved: ["yes", "in_process", "no", "unknown", "refused"],
  visited_properties: ["yes", "no", "unknown", "refused"],
  down_payment_ready: ["yes", "partial", "no", "unknown", "refused"],
  hard_deadline: ["yes", "no", "unknown", "refused"],
  requirements_defined: ["high", "medium", "low", "unknown", "refused"],
  comparison_mode: ["shortlist", "comparing", "exploring", "unknown", "refused"],
  buyer_type: ["individual", "couple", "family", "company", "investor", "unknown", "refused"],
};

function resolveQuestionFactor(question: QuestionLike): QuestionFactor {
  const rawFactor = question.metadata?.factor;
  if (typeof rawFactor === "string") {
    const normalized = rawFactor.trim() as QuestionFactor;
    if (QUESTION_FACTOR_ORDER.includes(normalized)) {
      return normalized;
    }
  }

  const inferred = QUESTION_FACTOR_BY_FIELD_KEY[question.field_key.trim()];
  return inferred ?? "capacidad_financiera";
}

function resolveQuestionTypeLabel(questionType?: string | null) {
  if (!questionType) return "Opción única";
  return QUESTION_TYPE_LABELS[questionType] ?? questionType;
}

function resolveRuleValueOptions(fieldKey: string): string[] {
  const options = RULE_VALUE_PRESETS_BY_FIELD_KEY[fieldKey.trim()] ?? [];
  return Array.from(new Set(options));
}

type Props = {
  initialWebchat: ScoringConfigBundle;
  initialWhatsapp: ScoringConfigBundle;
};

type QuestionRow = ScoringConfigBundle["questions"][number];

function readNumber(record: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const value = record?.[key];
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildWeightForm(profile?: ScoringProfile): WeightForm {
  const source = profile?.weights ?? {};
  return {
    capacidad_financiera: String(readNumber(source, "capacidad_financiera", 30)),
    urgencia: String(readNumber(source, "urgencia", 20)),
    nivel_decision: String(readNumber(source, "nivel_decision", 20)),
    autoridad: String(readNumber(source, "autoridad", 15)),
    interaccion_compromiso: String(readNumber(source, "interaccion_compromiso", 15)),
  };
}

function buildThresholdForm(profile?: ScoringProfile): ThresholdForm {
  const source = profile?.thresholds ?? {};
  return {
    explorando_max: String(readNumber(source, "explorando_max", 50)),
    interesado_max: String(readNumber(source, "interesado_max", 75)),
    listo_min: String(readNumber(source, "listo_min", 76)),
  };
}

function buildConfidenceForm(profile?: ScoringProfile): ConfidenceForm {
  const source = profile?.confidence_thresholds ?? {};
  return {
    medium_min: String(readNumber(source, "medium_min", 0.5)),
    high_min: String(readNumber(source, "high_min", 0.8)),
  };
}

function parsePercent(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function parseConfidence(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, Number(parsed.toFixed(2))));
}

export function ScoringConfigPanel({ initialWebchat, initialWhatsapp }: Props) {
  const [channel, setChannel] = useState<ScoringChannel>("whatsapp");
  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [bundles, setBundles] = useState<Record<ScoringChannel, ScoringConfigBundle>>({
    whatsapp: initialWhatsapp,
    webchat: initialWebchat,
  });

  const activeBundle = bundles[channel];
  const activeProfile = activeBundle.profiles[0];

  const [weightsForm, setWeightsForm] = useState<WeightForm>(buildWeightForm(initialWhatsapp.profiles[0]));
  const [thresholdForm, setThresholdForm] = useState<ThresholdForm>(
    buildThresholdForm(initialWhatsapp.profiles[0]),
  );
  const [confidenceForm, setConfidenceForm] = useState<ConfidenceForm>(
    buildConfidenceForm(initialWhatsapp.profiles[0]),
  );

  const [questionEditingId, setQuestionEditingId] = useState<string | null>(null);
  const [questionField, setQuestionField] = useState("");
  const [questionFieldPreset, setQuestionFieldPreset] = useState<string>("");
  const [questionFieldCustom, setQuestionFieldCustom] = useState("");
  const [questionText, setQuestionText] = useState("");
  const [questionOrder, setQuestionOrder] = useState("100");
  const [questionRepreguntaMax, setQuestionRepreguntaMax] = useState("1");
  const [questionType, setQuestionType] = useState("single_choice");
  const [questionRequiredCaseA, setQuestionRequiredCaseA] = useState(false);
  const [questionActive, setQuestionActive] = useState(true);
  const [questionFactor, setQuestionFactor] = useState<QuestionFactor>("capacidad_financiera");
  const [questionEditField, setQuestionEditField] = useState("");
  const [questionEditFieldPreset, setQuestionEditFieldPreset] = useState<string>("");
  const [questionEditFieldCustom, setQuestionEditFieldCustom] = useState("");
  const [questionEditText, setQuestionEditText] = useState("");
  const [questionEditOrder, setQuestionEditOrder] = useState("100");
  const [questionEditRepreguntaMax, setQuestionEditRepreguntaMax] = useState("1");
  const [questionEditType, setQuestionEditType] = useState("single_choice");
  const [questionEditRequiredCaseA, setQuestionEditRequiredCaseA] = useState(false);
  const [questionEditActive, setQuestionEditActive] = useState(true);
  const [questionEditFactor, setQuestionEditFactor] = useState<QuestionFactor>("capacidad_financiera");
  const [expandedFactor, setExpandedFactor] = useState<QuestionFactor | null>(null);
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);

  const [repromptEditingId, setRepromptEditingId] = useState<string | null>(null);
  const [, setRepromptQuestionId] = useState("");
  const [repromptIntento, setRepromptIntento] = useState("1");
  const [repromptText, setRepromptText] = useState("");
  const [repromptActive, setRepromptActive] = useState(true);

  const [ruleEditingId, setRuleEditingId] = useState<string | null>(null);
  const [, setRuleQuestionId] = useState("");
  const [ruleType, setRuleType] = useState("equals");
  const [ruleMatchValue, setRuleMatchValue] = useState("");
  const [ruleMatchValueMode, setRuleMatchValueMode] = useState<"preset" | "custom">("preset");
  const [ruleMinValue, setRuleMinValue] = useState("");
  const [ruleMaxValue, setRuleMaxValue] = useState("");
  const [ruleScore, setRuleScore] = useState("80");
  const [rulePriority, setRulePriority] = useState("100");
  const [ruleActive, setRuleActive] = useState(true);

  const questions = useMemo(
    () => [...(activeBundle.questions ?? [])].sort((a, b) => a.orden - b.orden),
    [activeBundle.questions],
  );
  const reprompts = useMemo(
    () => [...(activeBundle.reprompts ?? [])].sort((a, b) => a.intento - b.intento),
    [activeBundle.reprompts],
  );
  const rules = useMemo(
    () => [...(activeBundle.rules ?? [])].sort((a, b) => a.priority - b.priority),
    [activeBundle.rules],
  );
  const repromptsByQuestionId = useMemo(() => {
    const grouped = new Map<string, typeof reprompts>();
    for (const reprompt of reprompts) {
      const current = grouped.get(reprompt.question_id) ?? [];
      current.push(reprompt);
      grouped.set(reprompt.question_id, current);
    }
    return grouped;
  }, [reprompts]);
  const rulesByQuestionId = useMemo(() => {
    const grouped = new Map<string, typeof rules>();
    for (const rule of rules) {
      const current = grouped.get(rule.question_id) ?? [];
      current.push(rule);
      grouped.set(rule.question_id, current);
    }
    return grouped;
  }, [rules]);
  const questionsByFactor = useMemo(() => {
    const grouped = Object.fromEntries(
      QUESTION_FACTOR_ORDER.map((factor) => [factor, [] as typeof questions]),
    ) as Record<QuestionFactor, typeof questions>;

    for (const question of questions) {
      grouped[resolveQuestionFactor(question)].push(question);
    }

    for (const factor of QUESTION_FACTOR_ORDER) {
      grouped[factor].sort((a, b) => a.orden - b.orden);
    }

    return grouped;
  }, [questions]);

  const fieldKeyOptions = useMemo(() => {
    const presetOptions = FIELD_KEY_PRESETS.map((item) => ({
      value: item.key,
      label: item.label,
    }));
    const existingCustomFields = Array.from(
      new Set(
        questions
          .map((item) => item.field_key.trim())
          .filter((fieldKey) => Boolean(fieldKey) && !FIELD_KEY_LABEL_BY_KEY.has(fieldKey as FieldKey)),
      ),
    );
    return [
      ...presetOptions,
      ...existingCustomFields.map((fieldKey) => ({
        value: fieldKey,
        label: resolveFieldLabel(fieldKey) ?? "Dato personalizado (existente)",
      })),
    ];
  }, [questions]);

  const syncProfileEditors = (nextChannel: ScoringChannel) => {
    const profile = bundles[nextChannel]?.profiles?.[0];
    setWeightsForm(buildWeightForm(profile));
    setThresholdForm(buildThresholdForm(profile));
    setConfidenceForm(buildConfidenceForm(profile));
  };

  const resetQuestionForm = (nextFactor: QuestionFactor = "capacidad_financiera") => {
    setQuestionFactor(nextFactor);
    setQuestionField("");
    setQuestionFieldPreset("");
    setQuestionFieldCustom("");
    setQuestionText("");
    setQuestionOrder("100");
    setQuestionRepreguntaMax("1");
    setQuestionType("single_choice");
    setQuestionRequiredCaseA(false);
    setQuestionActive(true);
  };

  const resetQuestionEditForm = () => {
    setQuestionEditingId(null);
    setQuestionEditFactor("capacidad_financiera");
    setQuestionEditField("");
    setQuestionEditFieldPreset("");
    setQuestionEditFieldCustom("");
    setQuestionEditText("");
    setQuestionEditOrder("100");
    setQuestionEditRepreguntaMax("1");
    setQuestionEditType("single_choice");
    setQuestionEditRequiredCaseA(false);
    setQuestionEditActive(true);
  };

  const resetRepromptFormForQuestion = (questionId: string) => {
    resetRepromptForm();
    setRepromptQuestionId(questionId);
  };

  const resetRuleFormForQuestion = (questionId: string) => {
    resetRuleForm();
    syncRuleQuestionSelection(questionId);
  };

  const resetRepromptForm = () => {
    setRepromptEditingId(null);
    setRepromptQuestionId("");
    setRepromptIntento("1");
    setRepromptText("");
    setRepromptActive(true);
  };

  const resetRuleForm = () => {
    setRuleEditingId(null);
    setRuleQuestionId("");
    setRuleType("equals");
    setRuleMatchValue("");
    setRuleMatchValueMode("preset");
    setRuleMinValue("");
    setRuleMaxValue("");
    setRuleScore("80");
    setRulePriority("100");
    setRuleActive(true);
  };

  const syncRuleQuestionSelection = (questionId: string) => {
    setRuleQuestionId(questionId);
    const fieldKey = findQuestionFieldKey(questionId);
    const options = fieldKey ? resolveRuleValueOptions(fieldKey) : [];
    if (options.length) {
      setRuleMatchValueMode("preset");
      setRuleMatchValue(options[0]);
      return;
    }
    setRuleMatchValueMode("custom");
    setRuleMatchValue("");
  };

  const findQuestionFieldKey = (questionId: string): string | null => {
    const question = questions.find((item) => item.id === questionId);
    return question ? question.field_key : null;
  };

  const findFieldKeyLabel = (fieldKey: string): string => {
    return resolveFieldLabel(fieldKey) ?? fieldKey;
  };

  const startQuestionCreate = (factor: QuestionFactor) => {
    resetQuestionForm(factor);
    setExpandedFactor(factor);
    setExpandedQuestionId(null);
    const form = document.getElementById(`scoring-question-factor-${factor}`);
    form?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openQuestionFactor = (factor: QuestionFactor) => {
    resetQuestionForm(factor);
    setExpandedFactor(factor);
    setExpandedQuestionId(null);
  };

  const toggleQuestionFactor = (factor: QuestionFactor) => {
    if (expandedFactor === factor) {
      setExpandedFactor(null);
      setExpandedQuestionId(null);
      return;
    }
    openQuestionFactor(factor);
  };

  const startQuestionEdit = (question: QuestionRow) => {
    setQuestionEditingId(question.id);
    const nextFactor = resolveQuestionFactor(question);
    setExpandedFactor(nextFactor);
    setExpandedQuestionId(question.id);
    setQuestionEditFactor(nextFactor);
    setQuestionEditField(question.field_key);
    if (FIELD_KEY_PRESETS.some((preset) => preset.key === question.field_key)) {
      setQuestionEditFieldPreset(question.field_key);
      setQuestionEditFieldCustom("");
    } else {
      setQuestionEditFieldPreset(CUSTOM_FIELD_KEY);
      setQuestionEditFieldCustom(question.field_key);
    }
    setQuestionEditText(question.question_text);
    setQuestionEditOrder(String(question.orden));
    setQuestionEditRepreguntaMax(String(question.repregunta_max));
    setQuestionEditType(question.question_type ?? "single_choice");
    setQuestionEditRequiredCaseA(Boolean(question.required_for_case_a));
    setQuestionEditActive(Boolean(question.activa));
    setStatus(null, null);
  };

  const buildQuestionEditMetadata = (questionId: string | null) => {
    const currentQuestion = questions.find((item) => item.id === questionId);
    const currentMetadata =
      currentQuestion && typeof currentQuestion.metadata === "object" && currentQuestion.metadata !== null
        ? currentQuestion.metadata
        : {};
    return {
      ...currentMetadata,
      factor: questionEditFactor,
    };
  };

  const buildQuestionMetadata = (questionId: string | null) => {
    const currentQuestion = questions.find((item) => item.id === questionId);
    const currentMetadata =
      currentQuestion && typeof currentQuestion.metadata === "object" && currentQuestion.metadata !== null
        ? currentQuestion.metadata
        : {};
    return {
      ...currentMetadata,
      factor: questionFactor,
    };
  };

  const setStatus = (message: string | null, error: string | null = null) => {
    setStatusMessage(message);
    setErrorMessage(error);
  };

  const refreshBundle = (next: ScoringConfigBundle) => {
    setBundles((prev) => ({ ...prev, [next.canal]: next }));
  };

  const patchBundle = (patch: Partial<ScoringConfigBundle>) => {
    const current = bundles[channel];
    refreshBundle({ ...current, ...patch });
  };

  const weightTotal = WEIGHT_KEYS.reduce((acc, key) => acc + parsePercent(weightsForm[key], 0), 0);
  const weightGap = Number((100 - weightTotal).toFixed(0));
  const weightStatusLabel =
    weightTotal === 100
      ? "Cierra exacto"
      : weightTotal < 100
        ? `Faltan ${weightGap}%`
        : `Sobran ${Math.abs(weightGap)}%`;
  const weightStatusTone =
    weightTotal === 100 ? "emerald" : weightTotal < 100 ? "amber" : "rose";
  const weightChartRows = WEIGHT_KEYS.map((key) => ({
    key,
    label: WEIGHT_LABELS[key],
    value: parsePercent(weightsForm[key], 0),
    color: WEIGHT_COLORS[key],
  }));

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Button
          type="button"
          variant={channel === "whatsapp" ? "default" : "outline"}
          onClick={() => {
            setChannel("whatsapp");
            syncProfileEditors("whatsapp");
            resetQuestionForm();
            resetQuestionEditForm();
            setExpandedFactor(null);
            setExpandedQuestionId(null);
            resetRepromptForm();
            resetRuleForm();
            setStatus(null, null);
          }}
        >
          WhatsApp
        </Button>
        <Button
          type="button"
          variant={channel === "webchat" ? "default" : "outline"}
          onClick={() => {
            setChannel("webchat");
            syncProfileEditors("webchat");
            resetQuestionForm();
            resetQuestionEditForm();
            setExpandedFactor(null);
            setExpandedQuestionId(null);
            resetRepromptForm();
            resetRuleForm();
            setStatus(null, null);
          }}
        >
          Webchat
        </Button>
      </div>

      <section className="rounded-lg border p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Paso 1. Perfil de scoring</h2>
            <p className="text-sm text-muted-foreground">Ajusta pesos y umbrales con campos numéricos.</p>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.05fr_1.15fr_1.05fr]">
          <div className="space-y-3 rounded-md border p-3">
            <h3 className="text-sm font-medium">Pesos (%)</h3>
            <div className="space-y-3">
              {WEIGHT_KEYS.map((key) => (
                <div key={key} className="space-y-1 rounded-md border-l-4 bg-muted/20 px-3 py-2" style={{ borderLeftColor: WEIGHT_COLORS[key] }}>
                  <div className="flex items-center justify-between gap-2">
                    <Label className="flex items-center gap-2">
                      <span
                        className="inline-flex h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: WEIGHT_COLORS[key] }}
                      />
                      {WEIGHT_LABELS[key]}
                    </Label>
                    <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {parsePercent(weightsForm[key], 0)}%
                    </span>
                  </div>
                  <Input
                    type="number"
                    value={weightsForm[key]}
                    onChange={(event) =>
                      setWeightsForm((prev) => ({
                        ...prev,
                        [key]: event.target.value,
                      }))
                    }
                    min={0}
                    max={100}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <div className="space-y-1 text-center">
              <h3 className="text-sm font-medium">Vista gráfica de pesos</h3>
              <p className="text-xs text-muted-foreground">
                Esta gráfica se actualiza en vivo con los porcentajes que definas en la sección de Pesos (%)
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px]">
                <span className="rounded-full border px-2 py-0.5 text-muted-foreground">Meta: 100%</span>
                <span className="rounded-full border px-2 py-0.5 text-muted-foreground">
                  Suma de pesos: {weightTotal}%
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 ${
                    weightStatusTone === "emerald"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : weightStatusTone === "amber"
                        ? "border-amber-200 bg-amber-50 text-amber-900"
                        : "border-rose-200 bg-rose-50 text-rose-900"
                  }`}
                >
                  {weightStatusLabel}
                </span>
              </div>
            </div>
            <ChartContainer config={WEIGHT_CHART_CONFIG} className="h-[250px] w-full !aspect-auto">
              <BarChart data={weightChartRows} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" hide />
                <YAxis
                  allowDecimals={false}
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                />
                <ReferenceLine
                  y={100}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 4"
                  strokeOpacity={0.65}
                />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {weightChartRows.map((row) => (
                    <Cell key={row.key} fill={row.color} />
                  ))}
                  <LabelList
                    dataKey="value"
                    position="top"
                    formatter={(value: number | string) => `${value}%`}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
            <div className="flex flex-wrap justify-center gap-2">
              {weightChartRows.map((row) => (
                <div key={row.key} className="flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs">
                  <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                  <span>{row.label}</span>
                  <span className="text-muted-foreground">{row.value}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Umbrales de grado</h3>
              <div className="space-y-1">
                <Label>Explorando (máximo)</Label>
                <Input
                  type="number"
                  value={thresholdForm.explorando_max}
                  onChange={(event) =>
                    setThresholdForm((prev) => ({ ...prev, explorando_max: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Interesado (máximo)</Label>
                <Input
                  type="number"
                  value={thresholdForm.interesado_max}
                  onChange={(event) =>
                    setThresholdForm((prev) => ({ ...prev, interesado_max: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Listo (mínimo)</Label>
                <Input
                  type="number"
                  value={thresholdForm.listo_min}
                  onChange={(event) => setThresholdForm((prev) => ({ ...prev, listo_min: event.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2 rounded-md border bg-muted/20 p-3">
              <div className="space-y-1">
                <h4 className="text-sm font-medium">Confianza (0 a 1)</h4>
                <p className="text-xs text-muted-foreground">
                  Define a partir de qué nivel el score se considera confiable.
                </p>
              </div>
              <div className="space-y-1">
                <Label>Medium (mínimo)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={confidenceForm.medium_min}
                  onChange={(event) =>
                    setConfidenceForm((prev) => ({ ...prev, medium_min: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>High (mínimo)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={confidenceForm.high_min}
                  onChange={(event) => setConfidenceForm((prev) => ({ ...prev, high_min: event.target.value }))}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                setStatus(null, null);
                try {
                  const saved = await upsertScoringProfile({
                    canal: channel,
                    nombre: activeProfile?.nombre || "default",
                    activo: activeProfile?.activo ?? true,
                    weights: {
                      capacidad_financiera: parsePercent(weightsForm.capacidad_financiera, 30),
                      urgencia: parsePercent(weightsForm.urgencia, 20),
                      nivel_decision: parsePercent(weightsForm.nivel_decision, 20),
                      autoridad: parsePercent(weightsForm.autoridad, 15),
                      interaccion_compromiso: parsePercent(weightsForm.interaccion_compromiso, 15),
                    },
                    thresholds: {
                      explorando_max: parsePercent(thresholdForm.explorando_max, 50),
                      interesado_max: parsePercent(thresholdForm.interesado_max, 75),
                      listo_min: parsePercent(thresholdForm.listo_min, 76),
                    },
                    confidence_thresholds: {
                      medium_min: parseConfidence(confidenceForm.medium_min, 0.5),
                      high_min: parseConfidence(confidenceForm.high_min, 0.8),
                    },
                  });
                  patchBundle({ profiles: [saved] });
                  setStatus("Perfil guardado.");
                } catch (error) {
                  setStatus(null, error instanceof Error ? error.message : "No se pudo guardar el perfil.");
                }
              })
            }
          >
            Guardar perfil
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                setStatus(null, null);
                try {
                  const result = await seedScoringDefaults({ canal: channel, force: false });
                  const fresh = await fetchScoringConfig(channel);
                  refreshBundle(fresh);
                  syncProfileEditors(channel);
                  setStatus(
                    result.message ||
                      `Seed ${result.seeded ? "completado" : "omitido"} · preguntas ${result.questions_upserted} · reglas ${result.rules_inserted}.`,
                  );
                } catch (error) {
                  setStatus(null, error instanceof Error ? error.message : "No se pudo ejecutar seed.");
                }
              })
            }
          >
            Seed defaults
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                setStatus(null, null);
                try {
                  const result = await seedScoringDefaults({ canal: channel, force: true });
                  const fresh = await fetchScoringConfig(channel);
                  refreshBundle(fresh);
                  syncProfileEditors(channel);
                  setStatus(
                    result.message ||
                      `Seed forzado ${result.seeded ? "completado" : "omitido"} · preguntas ${result.questions_upserted} · reglas ${result.rules_inserted}.`,
                  );
                } catch (error) {
                  setStatus(null, error instanceof Error ? error.message : "No se pudo ejecutar seed forzado.");
                }
              })
            }
          >
            Seed force
          </Button>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border p-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Paso 2. Preguntas de perfilamiento</h2>
          <p className="text-sm text-muted-foreground">
            Cada peso se muestra como una fila expandible. Ahí puedes capturar preguntas nuevas, editar las existentes y ver
            su configuración sin perder el contexto del factor.
          </p>
        </div>

        <div className="space-y-3">
          {QUESTION_FACTOR_ORDER.map((factor) => {
            const bucket = questionsByFactor[factor];
            const isOpen = expandedFactor === factor;
            const factorColor = resolveQuestionFactorColor(factor);

            return (
              <div
                key={factor}
                id={`scoring-question-factor-${factor}`}
                className="overflow-hidden rounded-xl border-l-4 border bg-background"
                style={{ borderLeftColor: factorColor }}
              >
                <div
                  className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3"
                  style={{ backgroundColor: `${factorColor}12` }}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => toggleQuestionFactor(factor)}
                  >
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold"
                      style={{ borderColor: factorColor, color: factorColor }}
                    >
                      {isOpen ? "▾" : "▸"}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold">{QUESTION_FACTOR_LABELS[factor]}</h3>
                        <span
                          className="rounded-full border px-2 py-0.5 text-xs font-medium"
                          style={{ borderColor: factorColor, color: factorColor }}
                        >
                          {bucket.length} pregunta{bucket.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{QUESTION_FACTOR_HELP[factor]}</p>
                    </div>
                  </button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isPending}
                    className="border-transparent text-white hover:opacity-90"
                    style={{ backgroundColor: factorColor }}
                    onClick={() => startQuestionCreate(factor)}
                  >
                    Agregar
                  </Button>
                </div>

                {isOpen ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-[1260px] w-full border-separate border-spacing-0 text-sm">
                      <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="border-b px-3 py-3 w-20">Orden</th>
                          <th className="border-b px-3 py-3 min-w-[240px]">Pregunta</th>
                          <th className="border-b px-3 py-3 min-w-[180px]">Dato capturado</th>
                          <th className="border-b px-3 py-3 min-w-[160px]">Tipo de respuesta</th>
                          <th className="border-b px-3 py-3 hidden md:table-cell w-28">Opciones</th>
                          <th className="border-b px-3 py-3 w-24">Repreguntas</th>
                          <th className="border-b px-3 py-3 hidden md:table-cell w-36">Obligatoria para agendar</th>
                          <th className="border-b px-3 py-3 w-24">Activa</th>
                          <th className="border-b px-3 py-3 hidden lg:table-cell w-36">Agenda/Notificación</th>
                          <th className="border-b px-3 py-3 w-36">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="bg-muted/20 align-top">
                          <td className="border-b px-3 py-3">
                            <Input
                              type="number"
                              value={questionOrder}
                              onChange={(event) => setQuestionOrder(event.target.value)}
                              className="h-9"
                            />
                          </td>
                          <td className="border-b px-3 py-3">
                            <Input
                              placeholder="Nueva pregunta"
                              value={questionText}
                              onChange={(event) => setQuestionText(event.target.value)}
                              className="h-9"
                            />
                          </td>
                          <td className="border-b px-3 py-3">
                            <div className="space-y-2">
                              <select
                                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                                value={questionFieldPreset}
                                onChange={(event) => {
                                  const next = event.target.value;
                                  setQuestionFieldPreset(next);
                                  if (next !== CUSTOM_FIELD_KEY) {
                                    setQuestionField(next);
                                    setQuestionFieldCustom("");
                                  } else {
                                    setQuestionField("");
                                  }
                                }}
                              >
                                <option value="">Selecciona el dato</option>
                                {fieldKeyOptions.map((item) => (
                                  <option key={item.value} value={item.value}>
                                    {item.label}
                                  </option>
                                ))}
                                <option value={CUSTOM_FIELD_KEY}>Otro campo (avanzado)</option>
                              </select>
                              {questionFieldPreset === CUSTOM_FIELD_KEY ? (
                                <Input
                                  placeholder="Field key personalizado"
                                  value={questionFieldCustom}
                                  onChange={(event) => {
                                    const next = event.target.value;
                                    setQuestionFieldCustom(next);
                                    setQuestionField(next);
                                  }}
                                  className="h-9"
                                />
                              ) : null}
                            </div>
                          </td>
                          <td className="border-b px-3 py-3">
                            <select
                              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                              value={questionType}
                              onChange={(event) => setQuestionType(event.target.value)}
                            >
                              {QUESTION_TYPE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="border-b px-3 py-3 hidden md:table-cell text-muted-foreground">
                            Se genera con reglas
                          </td>
                          <td className="border-b px-3 py-3">
                            <Input
                              type="number"
                              value={questionRepreguntaMax}
                              onChange={(event) => setQuestionRepreguntaMax(event.target.value)}
                              className="h-9"
                            />
                          </td>
                          <td className="border-b px-3 py-3 hidden md:table-cell">
                            <Label className="flex items-center gap-2 text-sm font-normal">
                              <Checkbox
                                checked={questionRequiredCaseA}
                                onCheckedChange={(value) => setQuestionRequiredCaseA(Boolean(value))}
                              />
                              Obligatoria para agendar
                            </Label>
                          </td>
                          <td className="border-b px-3 py-3">
                            <Label className="flex items-center gap-2 text-sm font-normal">
                              <Checkbox
                                checked={questionActive}
                                onCheckedChange={(value) => setQuestionActive(Boolean(value))}
                              />
                              Sí
                            </Label>
                          </td>
                          <td className="border-b px-3 py-3 hidden lg:table-cell">
                            <span className="text-muted-foreground">
                              {questionRequiredCaseA ? "Sí" : "No"}
                            </span>
                          </td>
                          <td className="border-b px-3 py-3">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                disabled={isPending}
                                onClick={() =>
                                  startTransition(async () => {
                                    setStatus(null, null);
                                    const resolvedFieldKey = questionField.trim();
                                    if (!resolvedFieldKey) {
                                      setStatus(null, "Selecciona el dato (field_key) de la pregunta.");
                                      return;
                                    }
                                    if (!questionText.trim()) {
                                      setStatus(null, "Escribe el texto de la pregunta.");
                                      return;
                                    }
                                    try {
                                      const factorBeforeSave = questionFactor;
                                      const saved = await upsertScoringQuestion({
                                        id: undefined,
                                        canal: channel,
                                        field_key: resolvedFieldKey,
                                        question_text: questionText.trim(),
                                        question_type: questionType.trim() || "single_choice",
                                        orden: Number(questionOrder || "100"),
                                        repregunta_max: Number(questionRepreguntaMax || "1"),
                                        required_for_case_a: questionRequiredCaseA,
                                        activa: questionActive,
                                        allow_unknown: true,
                                        allow_refused: true,
                                        metadata: buildQuestionMetadata(null),
                                      });
                                      patchBundle({
                                        questions: [...questions.filter((item) => item.id !== saved.id), saved],
                                      });
                                      resetQuestionForm(factorBeforeSave);
                                      setExpandedFactor(factorBeforeSave);
                                      setStatus("Pregunta guardada.");
                                    } catch (error) {
                                      setStatus(null, error instanceof Error ? error.message : "No se pudo guardar la pregunta.");
                                    }
                                  })
                                }
                              >
                                Crear
                              </Button>
                            </div>
                          </td>
                        </tr>

                        {bucket.length ? (
                          bucket.map((item) => {
                            const ruleCount = rulesByQuestionId.get(item.id)?.length ?? 0;
                            const repromptCount = repromptsByQuestionId.get(item.id)?.length ?? 0;
                            const itemRules = rulesByQuestionId.get(item.id) ?? [];
                            const itemReprompts = repromptsByQuestionId.get(item.id) ?? [];
                            const isQuestionOpen = expandedQuestionId === item.id;
                            const isQuestionEditing = questionEditingId === item.id;

                            return (
                              <Fragment key={item.id}>
                                {isQuestionEditing ? (
                                  <tr className="align-top bg-sky-50/60">
                                    <td className="border-b px-3 py-3">
                                      <Input
                                        type="number"
                                        value={questionEditOrder}
                                        onChange={(event) => setQuestionEditOrder(event.target.value)}
                                        className="h-9"
                                      />
                                    </td>
                                    <td className="border-b px-3 py-3">
                                      <Input
                                        value={questionEditText}
                                        onChange={(event) => setQuestionEditText(event.target.value)}
                                        className="h-9"
                                      />
                                    </td>
                                    <td className="border-b px-3 py-3">
                                      <div className="space-y-2">
                                        <select
                                          className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                                          value={questionEditFieldPreset}
                                          onChange={(event) => {
                                            const next = event.target.value;
                                            setQuestionEditFieldPreset(next);
                                            if (next !== CUSTOM_FIELD_KEY) {
                                              setQuestionEditField(next);
                                              setQuestionEditFieldCustom("");
                                            } else {
                                              setQuestionEditField("");
                                            }
                                          }}
                                        >
                                          <option value="">Selecciona el dato</option>
                                          {fieldKeyOptions.map((itemOption) => (
                                            <option key={itemOption.value} value={itemOption.value}>
                                              {itemOption.label}
                                            </option>
                                          ))}
                                          <option value={CUSTOM_FIELD_KEY}>Otro campo (avanzado)</option>
                                        </select>
                                        {questionEditFieldPreset === CUSTOM_FIELD_KEY ? (
                                          <Input
                                            placeholder="Field key personalizado"
                                            value={questionEditFieldCustom}
                                            onChange={(event) => {
                                              const next = event.target.value;
                                              setQuestionEditFieldCustom(next);
                                              setQuestionEditField(next);
                                            }}
                                            className="h-9"
                                          />
                                        ) : null}
                                      </div>
                                    </td>
                                    <td className="border-b px-3 py-3">
                                      <select
                                        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                                        value={questionEditType}
                                        onChange={(event) => setQuestionEditType(event.target.value)}
                                      >
                                        {QUESTION_TYPE_OPTIONS.map((option) => (
                                          <option key={option.value} value={option.value}>
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="border-b px-3 py-3 hidden md:table-cell text-muted-foreground">
                                      Se genera con reglas
                                    </td>
                                    <td className="border-b px-3 py-3">
                                      <Input
                                        type="number"
                                        value={questionEditRepreguntaMax}
                                        onChange={(event) => setQuestionEditRepreguntaMax(event.target.value)}
                                        className="h-9"
                                      />
                                    </td>
                                    <td className="border-b px-3 py-3 hidden md:table-cell">
                                      <Label className="flex items-center gap-2 text-sm font-normal">
                                        <Checkbox
                                          checked={questionEditRequiredCaseA}
                                          onCheckedChange={(value) => setQuestionEditRequiredCaseA(Boolean(value))}
                                        />
                                        Obligatoria para agendar
                                      </Label>
                                    </td>
                                    <td className="border-b px-3 py-3">
                                      <Label className="flex items-center gap-2 text-sm font-normal">
                                        <Checkbox
                                          checked={questionEditActive}
                                          onCheckedChange={(value) => setQuestionEditActive(Boolean(value))}
                                        />
                                        Sí
                                      </Label>
                                    </td>
                                    <td className="border-b px-3 py-3 hidden lg:table-cell">
                                      <span
                                        className={`rounded-full px-2 py-1 text-xs ${
                                          questionEditRequiredCaseA ? "bg-sky-100 text-sky-900" : "bg-muted text-muted-foreground"
                                        }`}
                                      >
                                        {questionEditRequiredCaseA ? "Sí" : "No"}
                                      </span>
                                    </td>
                                    <td className="border-b px-3 py-3">
                                      <div className="flex flex-wrap gap-2">
                                        <Button
                                          type="button"
                                          disabled={isPending}
                                          onClick={() =>
                                            startTransition(async () => {
                                              setStatus(null, null);
                                              const resolvedFieldKey = questionEditField.trim();
                                              if (!resolvedFieldKey) {
                                                setStatus(null, "Selecciona el dato (field_key) de la pregunta.");
                                                return;
                                              }
                                              if (!questionEditText.trim()) {
                                                setStatus(null, "Escribe el texto de la pregunta.");
                                                return;
                                              }
                                              try {
                                                const saved = await upsertScoringQuestion({
                                                  id: questionEditingId ?? undefined,
                                                  canal: channel,
                                                  field_key: resolvedFieldKey,
                                                  question_text: questionEditText.trim(),
                                                  question_type: questionEditType.trim() || "single_choice",
                                                  orden: Number(questionEditOrder || "100"),
                                                  repregunta_max: Number(questionEditRepreguntaMax || "1"),
                                                  required_for_case_a: questionEditRequiredCaseA,
                                                  activa: questionEditActive,
                                                  allow_unknown: true,
                                                  allow_refused: true,
                                                  metadata: buildQuestionEditMetadata(questionEditingId),
                                                });
                                                patchBundle({
                                                  questions: [...questions.filter((question) => question.id !== saved.id), saved],
                                                });
                                                resetQuestionEditForm();
                                                setExpandedQuestionId(item.id);
                                                setStatus("Pregunta actualizada.");
                                              } catch (error) {
                                                setStatus(null, error instanceof Error ? error.message : "No se pudo guardar la pregunta.");
                                              }
                                            })
                                          }
                                        >
                                          Guardar
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          disabled={isPending}
                                          onClick={() => resetQuestionEditForm()}
                                        >
                                          Cancelar
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          disabled={isPending}
                                          onClick={() =>
                                            startTransition(async () => {
                                              try {
                                                await deleteScoringQuestion(item.id);
                                                patchBundle({
                                                  questions: questions.filter((question) => question.id !== item.id),
                                                });
                                                setStatus("Pregunta eliminada.");
                                                resetQuestionEditForm();
                                                if (expandedQuestionId === item.id) {
                                                  setExpandedQuestionId(null);
                                                }
                                              } catch (error) {
                                                setStatus(null, error instanceof Error ? error.message : "No se pudo eliminar la pregunta.");
                                              }
                                            })
                                          }
                                        >
                                          Eliminar
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                ) : (
                                  <tr className="align-top hover:bg-muted/30">
                                    <td className="border-b px-3 py-3 font-medium">{item.orden}</td>
                                    <td className="border-b px-3 py-3">
                                      <div className="space-y-1">
                                        <p className="font-medium leading-5">{item.question_text}</p>
                                        <p className="text-xs text-muted-foreground md:hidden">
                                          {findFieldKeyLabel(item.field_key)} · {resolveQuestionTypeLabel(item.question_type)} ·{" "}
                                          {ruleCount ? `${ruleCount} opciones` : "Sin opciones"} · {repromptCount} repreguntas
                                        </p>
                                      </div>
                                    </td>
                                    <td className="border-b px-3 py-3">{findFieldKeyLabel(item.field_key)}</td>
                                    <td className="border-b px-3 py-3">{resolveQuestionTypeLabel(item.question_type)}</td>
                                    <td className="border-b px-3 py-3 hidden md:table-cell text-muted-foreground">
                                      {ruleCount ? `${ruleCount} opciones` : "Sin opciones"}
                                    </td>
                                    <td className="border-b px-3 py-3">{repromptCount}</td>
                                    <td className="border-b px-3 py-3 hidden md:table-cell">
                                      <span
                                        className={`rounded-full px-2 py-1 text-xs ${
                                          item.required_for_case_a ? "bg-emerald-100 text-emerald-900" : "bg-muted text-muted-foreground"
                                        }`}
                                      >
                                        {item.required_for_case_a ? "Sí" : "No"}
                                      </span>
                                    </td>
                                    <td className="border-b px-3 py-3">
                                      <span
                                        className={`rounded-full px-2 py-1 text-xs ${
                                          item.activa ? "bg-emerald-100 text-emerald-900" : "bg-muted text-muted-foreground"
                                        }`}
                                      >
                                        {item.activa ? "Sí" : "No"}
                                      </span>
                                    </td>
                                    <td className="border-b px-3 py-3 hidden lg:table-cell">
                                      <span
                                        className={`rounded-full px-2 py-1 text-xs ${
                                          item.required_for_case_a ? "bg-sky-100 text-sky-900" : "bg-muted text-muted-foreground"
                                        }`}
                                      >
                                        {item.required_for_case_a ? "Sí" : "No"}
                                      </span>
                                    </td>
                                    <td className="border-b px-3 py-3">
                                      <div className="flex flex-wrap gap-2">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          disabled={isPending}
                                          onClick={() => {
                                            startQuestionEdit(item);
                                            setExpandedQuestionId(item.id);
                                          }}
                                        >
                                          Editar
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          disabled={isPending}
                                          onClick={() => setExpandedQuestionId(isQuestionOpen ? null : item.id)}
                                        >
                                          {isQuestionOpen ? "Ocultar" : "Detalle"}
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          disabled={isPending}
                                          onClick={() =>
                                            startTransition(async () => {
                                              try {
                                                await deleteScoringQuestion(item.id);
                                                patchBundle({
                                                  questions: questions.filter((question) => question.id !== item.id),
                                                });
                                                setStatus("Pregunta eliminada.");
                                                if (questionEditingId === item.id) {
                                                  resetQuestionEditForm();
                                                }
                                                if (expandedQuestionId === item.id) {
                                                  setExpandedQuestionId(null);
                                                }
                                              } catch (error) {
                                                setStatus(null, error instanceof Error ? error.message : "No se pudo eliminar la pregunta.");
                                              }
                                            })
                                          }
                                        >
                                          Eliminar
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                                {isQuestionOpen ? (
                                  <tr className="bg-muted/20">
                                    <td colSpan={10} className="border-b px-3 py-4">
                                      <div className="grid gap-4 xl:grid-cols-2">
                                        <div className="space-y-3 rounded-xl border bg-background p-4">
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div>
                                              <h4 className="text-sm font-semibold">Puntuación</h4>
                                              <p className="text-xs text-muted-foreground">
                                                Define qué respuesta vale y cuánto puntúa.
                                              </p>
                                            </div>
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="sm"
                                              disabled={isPending}
                                              onClick={() => {
                                                resetRuleFormForQuestion(item.id);
                                                setRuleEditingId(null);
                                              }}
                                            >
                                              + Agregar opción
                                            </Button>
                                          </div>

                                          {(() => {
                                            const itemRuleValueOptions = resolveRuleValueOptions(item.field_key);
                                            const canUsePresetValues =
                                              itemRuleValueOptions.length > 0 &&
                                              (ruleType === "equals" || ruleType === "in_set");
                                            return (
                                          <div className="grid gap-2 md:grid-cols-7">
                                            <select
                                              className="h-9 rounded-md border bg-background px-3 text-sm"
                                              value={ruleType}
                                              onChange={(event) => {
                                                const nextType = event.target.value;
                                                setRuleType(nextType);
                                                if (nextType === "range" || nextType === "any") {
                                                  setRuleMatchValueMode("custom");
                                                  setRuleMatchValue("");
                                                  return;
                                                }
                                                if (canUsePresetValues) {
                                                  setRuleMatchValueMode("preset");
                                                  setRuleMatchValue(
                                                    itemRuleValueOptions.includes(ruleMatchValue)
                                                      ? ruleMatchValue
                                                      : itemRuleValueOptions[0],
                                                  );
                                                  return;
                                                }
                                                setRuleMatchValueMode("custom");
                                              }}
                                            >
                                              <option value="equals">Igual a</option>
                                              <option value="contains">Contiene</option>
                                              <option value="in_set">Está en lista</option>
                                              <option value="range">Rango</option>
                                              <option value="any">Cualquier valor</option>
                                            </select>
                                            <div className="space-y-2">
                                              {ruleType === "range" ? (
                                                <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                                                  Usa Mínimo y Máximo.
                                                </div>
                                              ) : ruleType === "any" ? (
                                                <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                                                  No requiere valor.
                                                </div>
                                              ) : canUsePresetValues ? (
                                                <>
                                                  <select
                                                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                                                    value={ruleMatchValueMode === "preset" ? ruleMatchValue : "__custom__"}
                                                    onChange={(event) => {
                                                      const next = event.target.value;
                                                      if (next === "__custom__") {
                                                        setRuleMatchValueMode("custom");
                                                        return;
                                                      }
                                                      setRuleMatchValueMode("preset");
                                                      setRuleMatchValue(next);
                                                    }}
                                                  >
                                                    {itemRuleValueOptions.map((option) => (
                                                      <option key={option} value={option}>
                                                        {option}
                                                      </option>
                                                    ))}
                                                    <option value="__custom__">Otro valor</option>
                                                  </select>
                                                  {ruleMatchValueMode === "custom" ? (
                                                    <Input
                                                      placeholder="Valor"
                                                      value={ruleMatchValue}
                                                      onChange={(event) => setRuleMatchValue(event.target.value)}
                                                      className="h-9"
                                                    />
                                                  ) : null}
                                                </>
                                              ) : (
                                                <Input
                                                  placeholder="Valor"
                                                  value={ruleMatchValue}
                                                  onChange={(event) => setRuleMatchValue(event.target.value)}
                                                  className="h-9"
                                                />
                                              )}
                                            </div>
                                            <Input
                                              placeholder="Mín"
                                              value={ruleMinValue}
                                              onChange={(event) => setRuleMinValue(event.target.value)}
                                              className="h-9"
                                            />
                                            <Input
                                              placeholder="Máx"
                                              value={ruleMaxValue}
                                              onChange={(event) => setRuleMaxValue(event.target.value)}
                                              className="h-9"
                                            />
                                            <Input
                                              placeholder="Puntos"
                                              value={ruleScore}
                                              onChange={(event) => setRuleScore(event.target.value)}
                                              className="h-9"
                                            />
                                            <Input
                                              placeholder="Prioridad"
                                              value={rulePriority}
                                              onChange={(event) => setRulePriority(event.target.value)}
                                              className="h-9"
                                            />
                                            <Label className="flex items-center gap-2 text-sm font-normal">
                                              <Checkbox
                                                checked={ruleActive}
                                                onCheckedChange={(value) => setRuleActive(Boolean(value))}
                                              />
                                              Activa
                                            </Label>
                                          </div>
                                            );
                                          })()}
                                          <div className="flex flex-wrap gap-2">
                                            <Button
                                              type="button"
                                              disabled={isPending}
                                              onClick={() =>
                                                startTransition(async () => {
                                                  setStatus(null, null);
                                                  try {
                                                    const saved = await upsertScoringRule({
                                                      id: ruleEditingId ?? undefined,
                                                      canal: channel,
                                                      question_id: item.id,
                                                      rule_type: ruleType.trim() || "equals",
                                                      match_value: ruleMatchValue.trim() || null,
                                                      min_value: ruleMinValue.trim() ? Number(ruleMinValue) : null,
                                                      max_value: ruleMaxValue.trim() ? Number(ruleMaxValue) : null,
                                                      score: Number(ruleScore || "80"),
                                                      priority: Number(rulePriority || "100"),
                                                      activa: ruleActive,
                                                    });
                                                    patchBundle({
                                                      rules: [...activeBundle.rules.filter((row) => row.id !== saved.id), saved],
                                                    });
                                                    resetRuleFormForQuestion(item.id);
                                                    setRuleEditingId(null);
                                                    setStatus(ruleEditingId ? "Opción actualizada." : "Opción guardada.");
                                                  } catch (error) {
                                                    setStatus(null, error instanceof Error ? error.message : "No se pudo guardar la opción.");
                                                  }
                                                })
                                              }
                                            >
                                              {ruleEditingId ? "Guardar opción" : "Guardar"}
                                            </Button>
                                            {ruleEditingId ? (
                                              <Button
                                                type="button"
                                                variant="outline"
                                                disabled={isPending}
                                                onClick={() => resetRuleFormForQuestion(item.id)}
                                              >
                                                Cancelar
                                              </Button>
                                            ) : null}
                                          </div>

                                          <div className="space-y-2">
                                            {itemRules.length ? (
                                              itemRules.map((rule) => (
                                                <div
                                                  key={rule.id}
                                                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                                                >
                                                  <div className="space-y-1">
                                                    <p className="font-medium">
                                                      {rule.rule_type} · {rule.match_value || "Cualquier valor"}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                      Puntos {rule.score} · Prioridad {rule.priority} ·{" "}
                                                      {rule.activa ? "Activa" : "Inactiva"}
                                                    </p>
                                                  </div>
                                                  <div className="flex flex-wrap gap-2">
                                                    <Button
                                                      type="button"
                                                      variant="outline"
                                                      size="sm"
                                                      disabled={isPending}
                                                      onClick={() => {
                                                        setRuleEditingId(rule.id);
                                                        setRuleQuestionId(item.id);
                                                        setRuleType(rule.rule_type);
                                                        setRuleMatchValue(rule.match_value ?? "");
                                                        const itemRuleValueOptions = resolveRuleValueOptions(item.field_key);
                                                        if (
                                                          itemRuleValueOptions.length > 0 &&
                                                          itemRuleValueOptions.includes(rule.match_value ?? "") &&
                                                          (rule.rule_type === "equals" || rule.rule_type === "in_set")
                                                        ) {
                                                          setRuleMatchValueMode("preset");
                                                        } else {
                                                          setRuleMatchValueMode("custom");
                                                        }
                                                        setRuleMinValue(rule.min_value == null ? "" : String(rule.min_value));
                                                        setRuleMaxValue(rule.max_value == null ? "" : String(rule.max_value));
                                                        setRuleScore(String(rule.score));
                                                        setRulePriority(String(rule.priority));
                                                        setRuleActive(Boolean(rule.activa));
                                                        setStatus(null, null);
                                                        setExpandedQuestionId(item.id);
                                                      }}
                                                    >
                                                      Editar
                                                    </Button>
                                                    <Button
                                                      type="button"
                                                      variant="outline"
                                                      size="sm"
                                                      disabled={isPending}
                                                      onClick={() =>
                                                        startTransition(async () => {
                                                          try {
                                                            await deleteScoringRule(rule.id);
                                                            patchBundle({
                                                              rules: activeBundle.rules.filter((row) => row.id !== rule.id),
                                                            });
                                                            setStatus("Opción eliminada.");
                                                            if (ruleEditingId === rule.id) {
                                                              resetRuleFormForQuestion(item.id);
                                                            }
                                                          } catch (error) {
                                                            setStatus(null, error instanceof Error ? error.message : "No se pudo eliminar la opción.");
                                                          }
                                                        })
                                                      }
                                                    >
                                                      Eliminar
                                                    </Button>
                                                  </div>
                                                </div>
                                              ))
                                            ) : (
                                              <div className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
                                                Todavía no hay opciones configuradas.
                                              </div>
                                            )}
                                          </div>
                                        </div>

                                        <div className="space-y-3 rounded-xl border bg-background p-4">
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div>
                                              <h4 className="text-sm font-semibold">Repreguntas</h4>
                                              <p className="text-xs text-muted-foreground">
                                                Define el segundo intento para pedir el dato.
                                              </p>
                                            </div>
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="sm"
                                              disabled={isPending}
                                              onClick={() => {
                                                resetRepromptFormForQuestion(item.id);
                                                setRepromptEditingId(null);
                                              }}
                                            >
                                              + Agregar repregunta
                                            </Button>
                                          </div>

                                          <div className="grid gap-2 md:grid-cols-3">
                                            <Input
                                              placeholder="Intento"
                                              value={repromptIntento}
                                              onChange={(event) => setRepromptIntento(event.target.value)}
                                              className="h-9"
                                            />
                                            <Input
                                              placeholder="Texto de repregunta"
                                              value={repromptText}
                                              onChange={(event) => setRepromptText(event.target.value)}
                                              className="h-9 md:col-span-2"
                                            />
                                          </div>
                                          <Label className="flex items-center gap-2 text-sm font-normal">
                                            <Checkbox
                                              checked={repromptActive}
                                              onCheckedChange={(value) => setRepromptActive(Boolean(value))}
                                            />
                                            Activa
                                          </Label>
                                          <div className="flex flex-wrap gap-2">
                                            <Button
                                              type="button"
                                              disabled={isPending}
                                              onClick={() =>
                                                startTransition(async () => {
                                                  setStatus(null, null);
                                                  try {
                                                    const saved = await upsertScoringReprompt({
                                                      id: repromptEditingId ?? undefined,
                                                      canal: channel,
                                                      question_id: item.id,
                                                      intento: Number(repromptIntento || "1"),
                                                      prompt_text: repromptText.trim(),
                                                      activa: repromptActive,
                                                    });
                                                    patchBundle({
                                                      reprompts: [...activeBundle.reprompts.filter((row) => row.id !== saved.id), saved],
                                                    });
                                                    resetRepromptFormForQuestion(item.id);
                                                    setRepromptEditingId(null);
                                                    setStatus(repromptEditingId ? "Repregunta actualizada." : "Repregunta guardada.");
                                                  } catch (error) {
                                                    setStatus(null, error instanceof Error ? error.message : "No se pudo guardar la repregunta.");
                                                  }
                                                })
                                              }
                                            >
                                              {repromptEditingId ? "Guardar repregunta" : "Guardar"}
                                            </Button>
                                            {repromptEditingId ? (
                                              <Button
                                                type="button"
                                                variant="outline"
                                                disabled={isPending}
                                                onClick={() => resetRepromptFormForQuestion(item.id)}
                                              >
                                                Cancelar
                                              </Button>
                                            ) : null}
                                          </div>

                                          <div className="space-y-2">
                                            {itemReprompts.length ? (
                                              itemReprompts.map((reprompt) => (
                                                <div
                                                  key={reprompt.id}
                                                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                                                >
                                                  <div className="space-y-1">
                                                    <p className="font-medium">Intento {reprompt.intento}</p>
                                                    <p className="text-xs text-muted-foreground">{reprompt.prompt_text}</p>
                                                  </div>
                                                  <div className="flex flex-wrap gap-2">
                                                    <Button
                                                      type="button"
                                                      variant="outline"
                                                      size="sm"
                                                      disabled={isPending}
                                                      onClick={() => {
                                                        setRepromptEditingId(reprompt.id);
                                                        setRepromptQuestionId(item.id);
                                                        setRepromptIntento(String(reprompt.intento));
                                                        setRepromptText(reprompt.prompt_text);
                                                        setRepromptActive(Boolean(reprompt.activa));
                                                        setStatus(null, null);
                                                        setExpandedQuestionId(item.id);
                                                      }}
                                                    >
                                                      Editar
                                                    </Button>
                                                    <Button
                                                      type="button"
                                                      variant="outline"
                                                      size="sm"
                                                      disabled={isPending}
                                                      onClick={() =>
                                                        startTransition(async () => {
                                                          try {
                                                            await deleteScoringReprompt(reprompt.id);
                                                            patchBundle({
                                                              reprompts: activeBundle.reprompts.filter((row) => row.id !== reprompt.id),
                                                            });
                                                            setStatus("Repregunta eliminada.");
                                                            if (repromptEditingId === reprompt.id) {
                                                              resetRepromptFormForQuestion(item.id);
                                                            }
                                                          } catch (error) {
                                                            setStatus(null, error instanceof Error ? error.message : "No se pudo eliminar la repregunta.");
                                                          }
                                                        })
                                                      }
                                                    >
                                                      Eliminar
                                                    </Button>
                                                  </div>
                                                </div>
                                              ))
                                            ) : (
                                              <div className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
                                                Todavía no hay repreguntas configuradas.
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                ) : null}
                              </Fragment>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={10} className="px-3 py-5 text-sm text-muted-foreground">
                              No hay preguntas en este peso.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="border-t px-4 py-4 text-sm text-muted-foreground">
                    El bloque está contraído. Usa Agregar o la flecha para abrirlo.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {statusMessage ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {statusMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}
