"use client";

import { useMemo, useState, useTransition } from "react";

import {
  deleteScoringQuestion,
  deleteScoringReprompt,
  deleteScoringRule,
  type ScoringChannel,
  type ScoringConfigBundle,
  upsertScoringProfile,
  upsertScoringQuestion,
  upsertScoringReprompt,
  upsertScoringRule,
} from "@/app/settings/scoring/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  initialWebchat: ScoringConfigBundle;
  initialWhatsapp: ScoringConfigBundle;
};

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function parseJsonObject(text: string, fallback: Record<string, unknown>): Record<string, unknown> {
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : fallback;
  } catch {
    return fallback;
  }
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
  const [weightsText, setWeightsText] = useState(prettyJson(activeProfile?.weights ?? {}));
  const [thresholdsText, setThresholdsText] = useState(prettyJson(activeProfile?.thresholds ?? {}));
  const [confidenceText, setConfidenceText] = useState(
    prettyJson(activeProfile?.confidence_thresholds ?? {}),
  );

  const [questionField, setQuestionField] = useState("");
  const [questionText, setQuestionText] = useState("");
  const [questionOrder, setQuestionOrder] = useState("100");
  const [questionRepreguntaMax, setQuestionRepreguntaMax] = useState("1");

  const [repromptQuestionId, setRepromptQuestionId] = useState("");
  const [repromptIntento, setRepromptIntento] = useState("1");
  const [repromptText, setRepromptText] = useState("");

  const [ruleQuestionId, setRuleQuestionId] = useState("");
  const [ruleType, setRuleType] = useState("equals");
  const [ruleMatchValue, setRuleMatchValue] = useState("");
  const [ruleScore, setRuleScore] = useState("80");
  const [rulePriority, setRulePriority] = useState("100");

  const questions = useMemo(() => activeBundle.questions ?? [], [activeBundle.questions]);

  const syncProfileEditors = (nextChannel: ScoringChannel) => {
    const profile = bundles[nextChannel]?.profiles?.[0];
    setWeightsText(prettyJson(profile?.weights ?? {}));
    setThresholdsText(prettyJson(profile?.thresholds ?? {}));
    setConfidenceText(prettyJson(profile?.confidence_thresholds ?? {}));
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

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Button
          type="button"
          variant={channel === "whatsapp" ? "default" : "outline"}
          onClick={() => {
            setChannel("whatsapp");
            syncProfileEditors("whatsapp");
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
            setStatus(null, null);
          }}
        >
          Webchat
        </Button>
      </div>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">Perfil de scoring ({channel})</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Weights JSON</Label>
            <Textarea value={weightsText} onChange={(event) => setWeightsText(event.target.value)} rows={8} />
          </div>
          <div className="space-y-2">
            <Label>Thresholds JSON</Label>
            <Textarea
              value={thresholdsText}
              onChange={(event) => setThresholdsText(event.target.value)}
              rows={8}
            />
          </div>
          <div className="space-y-2">
            <Label>Confidence JSON</Label>
            <Textarea
              value={confidenceText}
              onChange={(event) => setConfidenceText(event.target.value)}
              rows={8}
            />
          </div>
        </div>
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
                  weights: parseJsonObject(weightsText, activeProfile?.weights ?? {}),
                  thresholds: parseJsonObject(thresholdsText, activeProfile?.thresholds ?? {}),
                  confidence_thresholds: parseJsonObject(
                    confidenceText,
                    activeProfile?.confidence_thresholds ?? {},
                  ),
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
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">Preguntas</h2>
        <div className="grid gap-2 md:grid-cols-4">
          <Input
            placeholder="field_key"
            value={questionField}
            onChange={(event) => setQuestionField(event.target.value)}
          />
          <Input
            placeholder="texto de pregunta"
            value={questionText}
            onChange={(event) => setQuestionText(event.target.value)}
          />
          <Input
            placeholder="orden"
            value={questionOrder}
            onChange={(event) => setQuestionOrder(event.target.value)}
          />
          <Input
            placeholder="repregunta_max"
            value={questionRepreguntaMax}
            onChange={(event) => setQuestionRepreguntaMax(event.target.value)}
          />
        </div>
        <Button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              setStatus(null, null);
              try {
                const saved = await upsertScoringQuestion({
                  canal: channel,
                  field_key: questionField.trim(),
                  question_text: questionText.trim(),
                  orden: Number(questionOrder || "100"),
                  repregunta_max: Number(questionRepreguntaMax || "1"),
                });
                patchBundle({ questions: [...questions.filter((item) => item.id !== saved.id), saved] });
                setQuestionField("");
                setQuestionText("");
                setStatus("Pregunta guardada.");
              } catch (error) {
                setStatus(null, error instanceof Error ? error.message : "No se pudo guardar la pregunta.");
              }
            })
          }
        >
          Agregar pregunta
        </Button>
        <div className="space-y-2">
          {questions.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
              <span>
                <strong>{item.field_key}</strong> · {item.question_text} (orden {item.orden})
              </span>
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
                    } catch (error) {
                      setStatus(
                        null,
                        error instanceof Error ? error.message : "No se pudo eliminar la pregunta.",
                      );
                    }
                  })
                }
              >
                Eliminar
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">Repreguntas</h2>
        <div className="grid gap-2 md:grid-cols-3">
          <Input
            placeholder="question_id"
            value={repromptQuestionId}
            onChange={(event) => setRepromptQuestionId(event.target.value)}
          />
          <Input
            placeholder="intento"
            value={repromptIntento}
            onChange={(event) => setRepromptIntento(event.target.value)}
          />
          <Input
            placeholder="texto de repregunta"
            value={repromptText}
            onChange={(event) => setRepromptText(event.target.value)}
          />
        </div>
        <Button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              setStatus(null, null);
              try {
                const saved = await upsertScoringReprompt({
                  canal: channel,
                  question_id: repromptQuestionId.trim(),
                  intento: Number(repromptIntento || "1"),
                  prompt_text: repromptText.trim(),
                });
                patchBundle({
                  reprompts: [
                    ...activeBundle.reprompts.filter((item) => item.id !== saved.id),
                    saved,
                  ],
                });
                setRepromptText("");
                setStatus("Repregunta guardada.");
              } catch (error) {
                setStatus(null, error instanceof Error ? error.message : "No se pudo guardar la repregunta.");
              }
            })
          }
        >
          Agregar repregunta
        </Button>
        <div className="space-y-2">
          {activeBundle.reprompts.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
              <span>
                <strong>{item.question_id}</strong> · intento {item.intento} · {item.prompt_text}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      await deleteScoringReprompt(item.id);
                      patchBundle({
                        reprompts: activeBundle.reprompts.filter((reprompt) => reprompt.id !== item.id),
                      });
                      setStatus("Repregunta eliminada.");
                    } catch (error) {
                      setStatus(
                        null,
                        error instanceof Error ? error.message : "No se pudo eliminar la repregunta.",
                      );
                    }
                  })
                }
              >
                Eliminar
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">Reglas</h2>
        <div className="grid gap-2 md:grid-cols-5">
          <Input
            placeholder="question_id"
            value={ruleQuestionId}
            onChange={(event) => setRuleQuestionId(event.target.value)}
          />
          <Input
            placeholder="rule_type"
            value={ruleType}
            onChange={(event) => setRuleType(event.target.value)}
          />
          <Input
            placeholder="match_value"
            value={ruleMatchValue}
            onChange={(event) => setRuleMatchValue(event.target.value)}
          />
          <Input
            placeholder="score"
            value={ruleScore}
            onChange={(event) => setRuleScore(event.target.value)}
          />
          <Input
            placeholder="priority"
            value={rulePriority}
            onChange={(event) => setRulePriority(event.target.value)}
          />
        </div>
        <Button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              setStatus(null, null);
              try {
                const saved = await upsertScoringRule({
                  canal: channel,
                  question_id: ruleQuestionId.trim(),
                  rule_type: ruleType.trim() || "equals",
                  match_value: ruleMatchValue.trim() || null,
                  score: Number(ruleScore || "80"),
                  priority: Number(rulePriority || "100"),
                });
                patchBundle({ rules: [...activeBundle.rules.filter((item) => item.id !== saved.id), saved] });
                setStatus("Regla guardada.");
              } catch (error) {
                setStatus(null, error instanceof Error ? error.message : "No se pudo guardar la regla.");
              }
            })
          }
        >
          Agregar regla
        </Button>
        <div className="space-y-2">
          {activeBundle.rules.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
              <span>
                <strong>{item.question_id}</strong> · {item.rule_type} · {item.match_value || "(sin match)"} ·
                score {item.score}
              </span>
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
                    } catch (error) {
                      setStatus(null, error instanceof Error ? error.message : "No se pudo eliminar la regla.");
                    }
                  })
                }
              >
                Eliminar
              </Button>
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
