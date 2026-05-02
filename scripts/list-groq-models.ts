import 'dotenv/config';

type GroqModel = {
  id?: string;
  owned_by?: string;
  active?: boolean;
  context_window?: number;
};

type GroqModelsResponse = {
  data?: GroqModel[];
  error?: {
    message?: string;
  };
};

async function main() {
  const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY ?? process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error('Missing EXPO_PUBLIC_GROQ_API_KEY in .env.');
  }

  const response = await fetch('https://api.groq.com/openai/v1/models', {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  const data = (await response.json()) as GroqModelsResponse;

  if (!response.ok) {
    throw new Error(data.error?.message ?? `Groq model list failed with status ${response.status}.`);
  }

  const models = (data.data ?? [])
    .filter((model) => typeof model.id === 'string')
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  console.log(`Available Groq models (${models.length}):`);
  for (const model of models) {
    const details = [
      model.active === false ? 'inactive' : null,
      model.context_window ? `context ${model.context_window}` : null,
      model.owned_by ? `owned by ${model.owned_by}` : null,
    ].filter(Boolean);

    console.log(`- ${model.id}${details.length ? ` (${details.join(', ')})` : ''}`);
  }
}

main().catch((error) => {
  console.error('Failed to list Groq models:');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
