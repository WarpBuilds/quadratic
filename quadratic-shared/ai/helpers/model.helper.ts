import { MODEL_OPTIONS } from 'quadratic-shared/ai/models/AI_MODELS';
import type {
  AIModel,
  AIRequestBody,
  AnthropicModel,
  BedrockAnthropicModel,
  BedrockModel,
  OpenAIModel,
  XAIModel,
} from 'quadratic-shared/typesAndSchemasAI';

export function isBedrockModel(model: AIModel): model is BedrockModel {
  return MODEL_OPTIONS[model].provider === 'bedrock';
}

export function isBedrockAnthropicModel(model: AIModel): model is BedrockAnthropicModel {
  return MODEL_OPTIONS[model].provider === 'bedrock-anthropic';
}

export function isAnthropicModel(model: AIModel): model is AnthropicModel {
  return MODEL_OPTIONS[model].provider === 'anthropic';
}

export function isXAIModel(model: AIModel): model is XAIModel {
  return MODEL_OPTIONS[model].provider === 'xai';
}

export function isOpenAIModel(model: AIModel): model is OpenAIModel {
  return MODEL_OPTIONS[model].provider === 'openai';
}

export const getModelOptions = (
  model: AIModel,
  args: Pick<AIRequestBody, 'useTools' | 'useStream'>
): {
  stream: boolean;
  temperature: number;
  max_tokens: number;
} => {
  const { canStream, canStreamWithToolCalls, temperature, max_tokens } = MODEL_OPTIONS[model];

  const { useTools, useStream } = args;
  const stream = canStream
    ? useTools
      ? canStreamWithToolCalls && (useStream ?? canStream)
      : useStream ?? canStream
    : false;

  return { stream, temperature, max_tokens };
};
