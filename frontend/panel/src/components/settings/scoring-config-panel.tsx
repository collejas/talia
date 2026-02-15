"use client";

import { useMemo, useState, useTransition } from "react";

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

type WeightForm = Record<WeightKey, string>;

type ThresholdForm = {
  explorando_max: string;
  interesado_max: string;
  listo_min: string;
};

type ConfidenceForm = {
  medium_min: string;
  high_min: string;
};

type Props = {
  initialWebchat: ScoringConfigBundle;
  initialWhatsapp: ScoringConfigBundle;
};

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
  const [questionRequiredCaseA, setQuestionRequiredCaseA] = useState(false);
  const [questionActive, setQuestionActive] = useState(true);

  const [repromptEditingId, setRepromptEditingId] = useState<string | null>(null);
  const [repromptQuestionId, setRepromptQuestionId] = useState("");
  const [repromptIntento, setRepromptIntento] = useState("1");
  const [repromptText, setRepromptText] = useState("");
  const [repromptActive, setRepromptActive] = useState(true);

  const [ruleEditingId, setRuleEditingId] = useState<string | null>(null);
  const [ruleQuestionId, setRuleQuestionId] = useState("");
  const [ruleType, setRuleType] = useState("equals");
  const [ruleMatchValue, setRuleMatchValue] = useState("");
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

  const questionOptions = useMemo(
    () =>
      questions.map((question) => ({
        id: question.id,
        label: `${resolveFieldLabel(question.field_key) ?? "Dato personalizado"} · ${question.question_text}`,
      })),
    [questions],
  );

  const fieldKeyOptions = useMemo(() => {
    const uniqByChannel = Array.from(
      new Set(
        questions
          .map((item) => item.field_key.trim())
          .filter(Boolean),
      ),
    );
      return uniqByChannel.map((fieldKey) => ({
        value: fieldKey,
        label: resolveFieldLabel(fieldKey) ?? "Dato personalizado (existente)",
      }));
  }, [questions]);

  const syncProfileEditors = (nextChannel: ScoringChannel) => {
    const profile = bundles[nextChannel]?.profiles?.[0];
    setWeightsForm(buildWeightForm(profile));
    setThresholdForm(buildThresholdForm(profile));
    setConfidenceForm(buildConfidenceForm(profile));
  };

  const resetQuestionForm = () => {
    setQuestionEditingId(null);
    setQuestionField("");
    setQuestionFieldPreset("");
    setQuestionFieldCustom("");
    setQuestionText("");
    setQuestionOrder("100");
    setQuestionRepreguntaMax("1");
    setQuestionRequiredCaseA(false);
    setQuestionActive(true);
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
    setRuleMinValue("");
    setRuleMaxValue("");
    setRuleScore("80");
    setRulePriority("100");
    setRuleActive(true);
  };

  const findQuestionLabel = (questionId: string): string => {
    const option = questionOptions.find((item) => item.id === questionId);
    return option ? option.label : questionId;
  };

  const findFieldKeyLabel = (fieldKey: string): string => {
    return resolveFieldLabel(fieldKey) ?? fieldKey;
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
            <p className="text-sm text-muted-foreground">
              Ajusta pesos y umbrales con campos numéricos. No necesitas editar JSON.
            </p>
          </div>
          <div className="rounded-md border px-3 py-1 text-sm">
            Suma de pesos: <strong>{weightTotal}%</strong>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-2 rounded-md border p-3">
            <h3 className="text-sm font-medium">Pesos (%)</h3>
            {WEIGHT_KEYS.map((key) => (
              <div key={key} className="space-y-1">
                <Label>{WEIGHT_LABELS[key]}</Label>
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

          <div className="space-y-2 rounded-md border p-3">
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

          <div className="space-y-2 rounded-md border p-3">
            <h3 className="text-sm font-medium">Confianza (0 a 1)</h3>
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

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">Paso 2. Preguntas de perfilamiento</h2>
        <p className="text-sm text-muted-foreground">
          Define qué pregunta hará el asistente, el orden y si es obligatoria para habilitar agenda/notificación.
        </p>

        <div className="grid gap-2 md:grid-cols-4">
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
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
            <option value="">Selecciona el dato que se capturará</option>
            {fieldKeyOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
            <option value={CUSTOM_FIELD_KEY}>Otro campo (avanzado)</option>
          </select>
          <Input
            placeholder="Texto de pregunta"
            value={questionText}
            onChange={(event) => setQuestionText(event.target.value)}
          />
          <Input placeholder="Orden" value={questionOrder} onChange={(event) => setQuestionOrder(event.target.value)} />
          <Input
            placeholder="Repreguntas máximas"
            value={questionRepreguntaMax}
            onChange={(event) => setQuestionRepreguntaMax(event.target.value)}
          />
        </div>
        {questionFieldPreset === CUSTOM_FIELD_KEY ? (
          <Input
            placeholder="Escribe el field_key personalizado (avanzado)"
            value={questionFieldCustom}
            onChange={(event) => {
              const next = event.target.value;
              setQuestionFieldCustom(next);
              setQuestionField(next);
            }}
          />
        ) : null}

        <div className="flex flex-wrap gap-4">
          <Label className="flex items-center gap-2 text-sm font-normal">
            <Checkbox checked={questionRequiredCaseA} onCheckedChange={(value) => setQuestionRequiredCaseA(Boolean(value))} />
            Obligatoria para agenda / notificación
          </Label>
          <Label className="flex items-center gap-2 text-sm font-normal">
            <Checkbox checked={questionActive} onCheckedChange={(value) => setQuestionActive(Boolean(value))} />
            Activa
          </Label>
        </div>

        <div className="flex gap-2">
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
                try {
                  const saved = await upsertScoringQuestion({
                    id: questionEditingId ?? undefined,
                    canal: channel,
                    field_key: resolvedFieldKey,
                    question_text: questionText.trim(),
                    orden: Number(questionOrder || "100"),
                    repregunta_max: Number(questionRepreguntaMax || "1"),
                    required_for_case_a: questionRequiredCaseA,
                    activa: questionActive,
                  });
                  patchBundle({ questions: [...questions.filter((item) => item.id !== saved.id), saved] });
                  resetQuestionForm();
                  setStatus(questionEditingId ? "Pregunta actualizada." : "Pregunta guardada.");
                } catch (error) {
                  setStatus(null, error instanceof Error ? error.message : "No se pudo guardar la pregunta.");
                }
              })
            }
          >
            {questionEditingId ? "Guardar cambios" : "Agregar pregunta"}
          </Button>
          {questionEditingId ? (
            <Button type="button" variant="outline" disabled={isPending} onClick={resetQuestionForm}>
              Cancelar
            </Button>
          ) : null}
        </div>

        <div className="space-y-2">
          {questions.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-3 rounded border px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{item.question_text}</p>
                <p className="text-muted-foreground">
                  Dato: {findFieldKeyLabel(item.field_key)} · Orden: {item.orden} · Repreguntas: {item.repregunta_max} ·{" "}
                  {item.required_for_case_a ? "Obligatoria" : "Opcional"} · {item.activa ? "Activa" : "Inactiva"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() => {
                    setQuestionEditingId(item.id);
                    setQuestionField(item.field_key);
                    if (FIELD_KEY_PRESETS.some((preset) => preset.key === item.field_key)) {
                      setQuestionFieldPreset(item.field_key);
                      setQuestionFieldCustom("");
                    } else {
                      setQuestionFieldPreset(CUSTOM_FIELD_KEY);
                      setQuestionFieldCustom(item.field_key);
                    }
                    setQuestionText(item.question_text);
                    setQuestionOrder(String(item.orden));
                    setQuestionRepreguntaMax(String(item.repregunta_max));
                    setQuestionRequiredCaseA(Boolean(item.required_for_case_a));
                    setQuestionActive(Boolean(item.activa));
                    setStatus(null, null);
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
                        await deleteScoringQuestion(item.id);
                        patchBundle({ questions: questions.filter((question) => question.id !== item.id) });
                        setStatus("Pregunta eliminada.");
                        if (questionEditingId === item.id) resetQuestionForm();
                      } catch (error) {
                        setStatus(null, error instanceof Error ? error.message : "No se pudo eliminar la pregunta.");
                      }
                    })
                  }
                >
                  Eliminar
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">Paso 3. Repreguntas</h2>
        <p className="text-sm text-muted-foreground">Define la repregunta por intento para cada pregunta principal.</p>

        <div className="grid gap-2 md:grid-cols-3">
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={repromptQuestionId}
            onChange={(event) => setRepromptQuestionId(event.target.value)}
          >
            <option value="">Selecciona una pregunta</option>
            {questionOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <Input placeholder="Intento" value={repromptIntento} onChange={(event) => setRepromptIntento(event.target.value)} />
          <Input
            placeholder="Texto de repregunta"
            value={repromptText}
            onChange={(event) => setRepromptText(event.target.value)}
          />
        </div>

        <Label className="flex items-center gap-2 text-sm font-normal">
          <Checkbox checked={repromptActive} onCheckedChange={(value) => setRepromptActive(Boolean(value))} />
          Activa
        </Label>

        <div className="flex gap-2">
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
                    question_id: repromptQuestionId.trim(),
                    intento: Number(repromptIntento || "1"),
                    prompt_text: repromptText.trim(),
                    activa: repromptActive,
                  });
                  patchBundle({ reprompts: [...activeBundle.reprompts.filter((item) => item.id !== saved.id), saved] });
                  resetRepromptForm();
                  setStatus(repromptEditingId ? "Repregunta actualizada." : "Repregunta guardada.");
                } catch (error) {
                  setStatus(null, error instanceof Error ? error.message : "No se pudo guardar la repregunta.");
                }
              })
            }
          >
            {repromptEditingId ? "Guardar cambios" : "Agregar repregunta"}
          </Button>
          {repromptEditingId ? (
            <Button type="button" variant="outline" disabled={isPending} onClick={resetRepromptForm}>
              Cancelar
            </Button>
          ) : null}
        </div>

        <div className="space-y-2">
          {reprompts.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-3 rounded border px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{findQuestionLabel(item.question_id)}</p>
                <p className="text-muted-foreground">Intento {item.intento} · {item.prompt_text} · {item.activa ? "Activa" : "Inactiva"}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() => {
                    setRepromptEditingId(item.id);
                    setRepromptQuestionId(item.question_id);
                    setRepromptIntento(String(item.intento));
                    setRepromptText(item.prompt_text);
                    setRepromptActive(Boolean(item.activa));
                    setStatus(null, null);
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
                        await deleteScoringReprompt(item.id);
                        patchBundle({ reprompts: activeBundle.reprompts.filter((reprompt) => reprompt.id !== item.id) });
                        setStatus("Repregunta eliminada.");
                        if (repromptEditingId === item.id) resetRepromptForm();
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
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">Paso 4. Reglas de puntuación</h2>
        <p className="text-sm text-muted-foreground">Configura cuánto puntúa cada respuesta para cada pregunta.</p>

        <div className="grid gap-2 md:grid-cols-7">
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={ruleQuestionId}
            onChange={(event) => setRuleQuestionId(event.target.value)}
          >
            <option value="">Selecciona una pregunta</option>
            {questionOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={ruleType}
            onChange={(event) => setRuleType(event.target.value)}
          >
            <option value="equals">Igual a</option>
            <option value="contains">Contiene</option>
            <option value="in_set">Está en lista</option>
            <option value="range">Rango</option>
            <option value="any">Cualquier valor</option>
          </select>
          <Input placeholder="Valor" value={ruleMatchValue} onChange={(event) => setRuleMatchValue(event.target.value)} />
          <Input placeholder="Mínimo" value={ruleMinValue} onChange={(event) => setRuleMinValue(event.target.value)} />
          <Input placeholder="Máximo" value={ruleMaxValue} onChange={(event) => setRuleMaxValue(event.target.value)} />
          <Input placeholder="Puntos" value={ruleScore} onChange={(event) => setRuleScore(event.target.value)} />
          <Input placeholder="Prioridad" value={rulePriority} onChange={(event) => setRulePriority(event.target.value)} />
        </div>

        <Label className="flex items-center gap-2 text-sm font-normal">
          <Checkbox checked={ruleActive} onCheckedChange={(value) => setRuleActive(Boolean(value))} />
          Activa
        </Label>

        <div className="flex gap-2">
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
                    question_id: ruleQuestionId.trim(),
                    rule_type: ruleType.trim() || "equals",
                    match_value: ruleMatchValue.trim() || null,
                    min_value: ruleMinValue.trim() ? Number(ruleMinValue) : null,
                    max_value: ruleMaxValue.trim() ? Number(ruleMaxValue) : null,
                    score: Number(ruleScore || "80"),
                    priority: Number(rulePriority || "100"),
                    activa: ruleActive,
                  });
                  patchBundle({ rules: [...activeBundle.rules.filter((item) => item.id !== saved.id), saved] });
                  resetRuleForm();
                  setStatus(ruleEditingId ? "Regla actualizada." : "Regla guardada.");
                } catch (error) {
                  setStatus(null, error instanceof Error ? error.message : "No se pudo guardar la regla.");
                }
              })
            }
          >
            {ruleEditingId ? "Guardar cambios" : "Agregar regla"}
          </Button>
          {ruleEditingId ? (
            <Button type="button" variant="outline" disabled={isPending} onClick={resetRuleForm}>
              Cancelar
            </Button>
          ) : null}
        </div>

        <div className="space-y-2">
          {rules.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-3 rounded border px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{findQuestionLabel(item.question_id)}</p>
                <p className="text-muted-foreground">
                  Tipo: {item.rule_type} · Valor: {item.match_value || "-"} · Min: {item.min_value ?? "-"} · Max: {item.max_value ?? "-"} ·
                  Puntos: {item.score} · Prioridad: {item.priority} · {item.activa ? "Activa" : "Inactiva"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() => {
                    setRuleEditingId(item.id);
                    setRuleQuestionId(item.question_id);
                    setRuleType(item.rule_type);
                    setRuleMatchValue(item.match_value ?? "");
                    setRuleMinValue(item.min_value == null ? "" : String(item.min_value));
                    setRuleMaxValue(item.max_value == null ? "" : String(item.max_value));
                    setRuleScore(String(item.score));
                    setRulePriority(String(item.priority));
                    setRuleActive(Boolean(item.activa));
                    setStatus(null, null);
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
                        await deleteScoringRule(item.id);
                        patchBundle({ rules: activeBundle.rules.filter((rule) => rule.id !== item.id) });
                        setStatus("Regla eliminada.");
                        if (ruleEditingId === item.id) resetRuleForm();
                      } catch (error) {
                        setStatus(null, error instanceof Error ? error.message : "No se pudo eliminar la regla.");
                      }
                    })
                  }
                >
                  Eliminar
                </Button>
              </div>
            </div>
          ))}
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
