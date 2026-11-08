import net from 'node:net';
import path from 'node:path';

// Never inherit live integrations or a developer's .env into destructive tests.
export function isolatedTestEnv(overrides = {}) {
  return {
    ...process.env,
    DOTENV_CONFIG_PATH: path.resolve('test-output', '.no-env'),
    NODE_ENV: 'test', PORT: '3001',
    YOOKASSA_SHOP_ID: '', YOOKASSA_SECRET_KEY: '',
    S3_ENDPOINT: '', S3_BUCKET: '', S3_ACCESS_KEY_ID: '', S3_SECRET_ACCESS_KEY: '',
    ADMIN_ACCESS_CODE: 'admin-demo',
    ...overrides,
  };
}

export async function assertLocalTestPortsFree() {
  for (const port of [3000, 3001]) {
    const server = net.createServer();
    await new Promise((resolve, reject) => {
      server.once('error', () => reject(new Error(`Local test port ${port} is occupied. Stop only your own development server, then retry. Tests were not started.`)));
      server.listen(port, () => server.close(resolve));
    });
  }
}
