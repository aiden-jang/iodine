import os from 'os';
import path from 'path';
import type { CommandPart } from './signature';

export const COMMAND_EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2:q8';
export const COMMAND_EMBEDDING_FORMAT = 'normalized-v2';

async function createExtractor() {
  const { env, pipeline } = await import('@huggingface/transformers');
  env.cacheDir = path.join(os.homedir(), '.iodine', 'models');
  return pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8' });
}

let extractorPromise: ReturnType<typeof createExtractor> | null = null;

export function commandEmbeddingInput(part: CommandPart): string {
  const { signature, paths } = part;
  return [signature.program, signature.subcommand, ...signature.flags, ...signature.literalOperands, ...paths]
    .filter((value): value is string => Boolean(value))
    .join(' ');
}

export async function embedCommand(command: string): Promise<number[]> {
  const extractor = await (extractorPromise ??= createExtractor().catch(error => {
    extractorPromise = null;
    throw error;
  }));
  const output = await extractor(command, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
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
