import OpenAI from 'openai';
import type { CommandPart } from './signature';

export const COMMAND_EMBEDDING_MODEL = 'text-embedding-3-small';
export const COMMAND_EMBEDDING_FORMAT = 'normalized-v1';

export function commandEmbeddingInput(part: CommandPart): string {
  const { signature, paths } = part;
  return [
    `program: ${signature.program}`,
    `subcommand: ${signature.subcommand ?? 'none'}`,
    `flags: ${signature.flags.join(' ') || 'none'}`,
    `effects: ${Object.entries(signature.capability).filter(([, enabled]) => enabled).map(([effect]) => effect).join(' ') || 'none'}`,
    `literal arguments: ${signature.literalOperands.join(' ') || 'none'}`,
    `paths: ${paths.join(' ') || 'none'}`,
  ].join('\n');
}

export async function embedCommand(command: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_TOKEN;
  if (!apiKey) return null;

  const response = await new OpenAI({ apiKey, timeout: 5_000, maxRetries: 0 }).embeddings.create({
    model: COMMAND_EMBEDDING_MODEL,
    input: command,
  });
  return response.data[0]?.embedding ?? null;
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) return 0;

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  return leftMagnitude && rightMagnitude ? dot / Math.sqrt(leftMagnitude * rightMagnitude) : 0;
}
