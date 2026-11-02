import 'server-only';
import { APP_NAME, availableModels, defaultModelId, providers, IMAGE_MODEL } from './config';
import { storageKind } from './kv';
import { getSettings } from './store';

/** Everything the browser app needs on start-up (no secrets). */
export async function bootData(user) {
  const settings = await getSettings(user.id);
  const models = availableModels().map(({ id, provider, label, description }) => ({ id, provider, label, description }));
  const p = providers();
  return {
    user,
    appName: APP_NAME(),
    models,
    defaultModel: models.find((m) => m.id === settings.defaultModel)?.id || defaultModelId(),
    providers: p,
    imageModel: p.openai ? IMAGE_MODEL() : null,
    storage: storageKind(),
    production: process.env.NODE_ENV === 'production',
    settings,
  };
}
